/**
 * Fuzzy Logic Loan Approval Visualizer — Frontend Logic
 * Connects to Flask backend and renders interactive charts.
 */

const API_BASE = 'http://localhost:5000/api';

// ── Chart.js Global Defaults ────────────────────────────────────────────────
Chart.defaults.color = '#64748b'; // text-muted
Chart.defaults.borderColor = '#e2e8f0'; // border-color
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.animation.duration = 400;

// ── Color Palette (Banking light theme) ─────────────────────────────────────
const COLORS = {
    brand:  { solid: '#1e3a8a', bg: 'rgba(30, 58, 138, 0.1)' },
    accent: { solid: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)' },
    cyan:   { solid: '#0891b2', bg: 'rgba(8, 145, 178, 0.15)' },
    green:  { solid: '#15803d', bg: 'rgba(21, 128, 61, 0.15)' },
    amber:  { solid: '#b45309', bg: 'rgba(180, 83, 9, 0.15)' },
    red:    { solid: '#b91c1c', bg: 'rgba(185, 28, 28, 0.15)' },
};

const MF_COLOR_MAP = {
    poor: COLORS.red, fair: COLORS.amber, good: COLORS.cyan, excellent: COLORS.green,
    low: COLORS.green, medium: COLORS.amber, high: COLORS.red,
    short: COLORS.red, long: COLORS.green,
    reject: COLORS.red, review: COLORS.amber, approve: COLORS.green,
};

const VARIABLE_LABELS = {
    credit_score: 'Credit Score',
    income: 'Annual Income ($K)',
    dti: 'Debt-to-Income (%)',
    employment: 'Employment (Years)',
    approval: 'Approval Score',
};

// ── State ───────────────────────────────────────────────────────────────────
let chartInstances = {};
let membershipData = null;
let datasetResults = null;

// ── Tab Navigation ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');

        if (btn.dataset.tab === 'membership' && !membershipData) loadMembershipFunctions();
        if (btn.dataset.tab === 'dataset' && !datasetResults) loadDemoDataset();
        if (btn.dataset.tab === 'sensitivity' && !chartInstances['sensitivity-all']) loadAllSensitivity();
    });
});

// ── Slider Updates ──────────────────────────────────────────────────────────
['credit', 'income', 'dti', 'employment'].forEach(name => {
    const slider = document.getElementById(`slider-${name}`);
    const display = document.getElementById(`val-${name}`);
    slider.addEventListener('input', () => {
        display.textContent = slider.value;
    });
});

// ── Evaluate Button ─────────────────────────────────────────────────────────
document.getElementById('btn-evaluate').addEventListener('click', evaluateApplication);

async function evaluateApplication() {
    const btn = document.getElementById('btn-evaluate');
    btn.innerHTML = '<span class="loading-spinner"></span> Evaluating...';
    btn.disabled = true;

    const payload = {
        credit_score: +document.getElementById('slider-credit').value,
        income: +document.getElementById('slider-income').value,
        dti: +document.getElementById('slider-dti').value,
        employment: +document.getElementById('slider-employment').value,
    };

    try {
        const res = await fetch(`${API_BASE}/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        renderResult(data);
    } catch (err) {
        document.getElementById('result-zone').innerHTML = `
            <div class="placeholder-result">
                <div class="ph-icon"><i data-lucide="alert-triangle"></i></div>
                <p>Could not connect to the backend.<br>Make sure the Flask server is running on port 5000.</p>
            </div>`;
        lucide.createIcons();
    } finally {
        btn.innerHTML = '<i data-lucide="zap"></i> Evaluate Application';
        btn.disabled = false;
        lucide.createIcons();
    }
}

function renderResult(data) {
    const zone = document.getElementById('result-zone');
    const decisionClass = data.decision === 'APPROVED' ? 'approved' : data.decision === 'REVIEW' ? 'review' : 'rejected';
    const scoreColor = data.decision === 'APPROVED' ? '#15803d' : data.decision === 'REVIEW' ? '#b45309' : '#b91c1c';

    const circumference = 2 * Math.PI * 66; // r=66 for 140x140 viewbox
    const offset = circumference - (data.score / 100) * circumference;

    const decisionIcon = data.decision === 'APPROVED'
        ? '<i data-lucide="check-circle-2" style="width:16px;height:16px;"></i>'
        : data.decision === 'REVIEW'
        ? '<i data-lucide="clock" style="width:16px;height:16px;"></i>'
        : '<i data-lucide="x-circle" style="width:16px;height:16px;"></i>';

    zone.innerHTML = `
        <div class="score-display ${decisionClass}">
            <div class="score-circle">
                <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle class="score-ring-bg" cx="70" cy="70" r="66"/>
                    <circle class="score-ring-fg" cx="70" cy="70" r="66"
                        stroke="${scoreColor}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"/>
                </svg>
                <span class="score-num" style="color: ${scoreColor}">${data.score}</span>
                <span class="score-label">out of 100</span>
            </div>
            <div class="decision-badge ${decisionClass}">
                ${decisionIcon}
                ${data.decision}
            </div>
        </div>`;

    lucide.createIcons();
    renderMembershipBreakdown(data.memberships);
}

function renderMembershipBreakdown(memberships) {
    const card = document.getElementById('membership-detail-card');
    const container = document.getElementById('membership-breakdown');
    card.style.display = 'block';

    const barColors = {
        poor: '#b91c1c', fair: '#b45309', good: '#0891b2', excellent: '#15803d',
        low: '#15803d', medium: '#b45309', high: '#b91c1c',
        short: '#b91c1c', long: '#15803d',
        reject: '#b91c1c', review: '#b45309', approve: '#15803d',
    };

    let html = '';
    for (const [varName, terms] of Object.entries(memberships)) {
        html += `<div class="membership-item"><h4>${VARIABLE_LABELS[varName] || varName}</h4>`;
        for (const [term, value] of Object.entries(terms)) {
            const pct = (value * 100).toFixed(1);
            const color = barColors[term] || '#2563eb';
            html += `
                <div class="mem-bar-row">
                    <span class="mem-bar-label">${term}</span>
                    <div class="mem-bar-track">
                        <div class="mem-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                    </div>
                    <span class="mem-bar-value">${pct}%</span>
                </div>`;
        }
        html += '</div>';
    }
    container.innerHTML = html;
}

// ── Membership Functions Panel ──────────────────────────────────────────────
async function loadMembershipFunctions() {
    try {
        const res = await fetch(`${API_BASE}/membership-functions`);
        membershipData = await res.json();
        renderMFCharts();
    } catch (err) {
        document.getElementById('mf-charts-grid').innerHTML = `
            <div class="card"><div class="placeholder-result">
                <div class="ph-icon"><i data-lucide="alert-triangle"></i></div>
                <p>Cannot load membership data. Ensure the backend is running.</p>
            </div></div>`;
        lucide.createIcons();
    }
}

function renderMFCharts() {
    const grid = document.getElementById('mf-charts-grid');
    grid.innerHTML = '';

    for (const [varName, varData] of Object.entries(membershipData)) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${varData.label}</div>
            </div>
            <div class="chart-wrapper">
                <canvas id="mf-chart-${varName}"></canvas>
            </div>`;
        grid.appendChild(card);

        const ctx = card.querySelector('canvas').getContext('2d');
        const datasets = [];

        for (const [term, points] of Object.entries(varData.functions)) {
            const color = MF_COLOR_MAP[term] || COLORS.accent;
            datasets.push({
                label: term.charAt(0).toUpperCase() + term.slice(1),
                data: downsample(points.x, points.y, 120),
                borderColor: color.solid,
                backgroundColor: color.bg,
                fill: true,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
            });
        }

        chartInstances[`mf-${varName}`] = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'linear', title: { display: true, text: varData.label }, grid: { color: '#f1f5f9' } },
                    y: { min: 0, max: 1.05, title: { display: true, text: 'Membership' }, grid: { color: '#f1f5f9' } },
                },
                plugins: {
                    tooltip: {
                        backgroundColor: '#ffffff',
                        titleColor: '#0f172a',
                        bodyColor: '#334155',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        titleFont: { weight: '700', family: "'Inter', sans-serif" },
                        bodyFont: { family: "'Fira Code', monospace" },
                        padding: 12,
                        boxPadding: 6,
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}`
                        }
                    }
                }
            },
        });
    }
}

function downsample(xArr, yArr, maxPoints) {
    if (xArr.length <= maxPoints) return xArr.map((x, i) => ({ x, y: yArr[i] }));
    const step = Math.ceil(xArr.length / maxPoints);
    const result = [];
    for (let i = 0; i < xArr.length; i += step) {
        result.push({ x: xArr[i], y: yArr[i] });
    }
    return result;
}

// ── Demo Dataset Panel ──────────────────────────────────────────────────────
async function loadDemoDataset() {
    try {
        const res = await fetch(`${API_BASE}/demo-dataset`);
        datasetResults = await res.json();
        renderDatasetStats();
        renderDatasetTable();
        renderDistributionChart();
        renderDonutChart();
    } catch (err) {
        document.getElementById('dataset-tbody').innerHTML = `
            <tr><td colspan="10" style="text-align:center; padding:32px; color:var(--text-muted);">
                Cannot load dataset. Ensure the backend is running.
            </td></tr>`;
    }
}

function renderDatasetStats() {
    const total = datasetResults.length;
    const approved = datasetResults.filter(d => d.decision === 'APPROVED').length;
    const review = datasetResults.filter(d => d.decision === 'REVIEW').length;
    const rejected = datasetResults.filter(d => d.decision === 'REJECTED').length;

    document.getElementById('stats-bar').innerHTML = `
        <div class="stat-card">
            <div class="stat-number mono" style="color: var(--brand-primary)">${total}</div>
            <div class="stat-label">Total Applicants</div>
        </div>
        <div class="stat-card">
            <div class="stat-number mono" style="color: var(--green)">${approved}</div>
            <div class="stat-label">Approved</div>
        </div>
        <div class="stat-card">
            <div class="stat-number mono" style="color: var(--amber)">${review}</div>
            <div class="stat-label">Under Review</div>
        </div>
        <div class="stat-card">
            <div class="stat-number mono" style="color: var(--red)">${rejected}</div>
            <div class="stat-label">Rejected</div>
        </div>`;
}

function renderDatasetTable() {
    const tbody = document.getElementById('dataset-tbody');
    tbody.innerHTML = datasetResults.map(d => {
        const cls = d.decision === 'APPROVED' ? 'approved' : d.decision === 'REVIEW' ? 'review' : 'rejected';
        const scoreColor = d.decision === 'APPROVED' ? '#15803d' : d.decision === 'REVIEW' ? '#b45309' : '#b91c1c';
        return `
            <tr data-id="${d.id}" onclick="selectApplicant(${d.id})">
                <td class="mono">${d.id}</td>
                <td class="table-name">${d.name}</td>
                <td class="mono">${d.credit_score}</td>
                <td class="currency-cell">$${d.income}K</td>
                <td class="mono">${d.dti}%</td>
                <td class="mono">${d.employment} yrs</td>
                <td class="currency-cell">$${(d.loan_amount / 1000).toFixed(0)}K</td>
                <td><span class="purpose-badge">${d.purpose}</span></td>
                <td class="table-score" style="color:${scoreColor}">${d.score}</td>
                <td><span class="table-badge ${cls}">${d.decision}</span></td>
            </tr>`;
    }).join('');
}

function selectApplicant(id) {
    const applicant = datasetResults.find(d => d.id === id);
    if (!applicant) return;

    document.getElementById('slider-credit').value = applicant.credit_score;
    document.getElementById('val-credit').textContent = applicant.credit_score;
    document.getElementById('slider-income').value = applicant.income;
    document.getElementById('val-income').textContent = applicant.income;
    document.getElementById('slider-dti').value = applicant.dti;
    document.getElementById('val-dti').textContent = applicant.dti;
    document.getElementById('slider-employment').value = applicant.employment;
    document.getElementById('val-employment').textContent = applicant.employment;

    document.querySelectorAll('.data-table tbody tr').forEach(tr => tr.classList.remove('selected'));
    document.querySelector(`tr[data-id="${id}"]`)?.classList.add('selected');

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-evaluator').classList.add('active');
    document.getElementById('panel-evaluator').classList.add('active');
    evaluateApplication();
}
window.selectApplicant = selectApplicant;

function renderDistributionChart() {
    if (chartInstances['distribution']) chartInstances['distribution'].destroy();

    const ctx = document.getElementById('chart-distribution').getContext('2d');
    const sorted = [...datasetResults].sort((a, b) => b.score - a.score);

    chartInstances['distribution'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(d => d.name.split(' ')[0]),
            datasets: [{
                label: 'Approval Score',
                data: sorted.map(d => d.score),
                backgroundColor: sorted.map(d =>
                    d.decision === 'APPROVED' ? 'rgba(21, 128, 61, 0.6)' :
                    d.decision === 'REVIEW' ? 'rgba(180, 83, 9, 0.6)' :
                    'rgba(185, 28, 28, 0.6)'
                ),
                borderColor: sorted.map(d =>
                    d.decision === 'APPROVED' ? '#15803d' :
                    d.decision === 'REVIEW' ? '#b45309' : '#b91c1c'
                ),
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    titleFont: { weight: '700', family: "'Inter', sans-serif" },
                    bodyFont: { family: "'Fira Code', monospace" },
                    padding: 12,
                    callbacks: {
                        title: (items) => sorted[items[0].dataIndex].name,
                        label: (item) => `Score: ${item.parsed.y} — ${sorted[item.dataIndex].decision}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } },
            }
        }
    });
}

function renderDonutChart() {
    if (chartInstances['donut']) chartInstances['donut'].destroy();

    const approved = datasetResults.filter(d => d.decision === 'APPROVED').length;
    const review = datasetResults.filter(d => d.decision === 'REVIEW').length;
    const rejected = datasetResults.filter(d => d.decision === 'REJECTED').length;

    const ctx = document.getElementById('chart-donut').getContext('2d');
    chartInstances['donut'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Approved', 'Review', 'Rejected'],
            datasets: [{
                data: [approved, review, rejected],
                backgroundColor: ['#15803d', '#b45309', '#b91c1c'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 10,
                }
            }
        }
    });
}

// ── Sensitivity Panel ───────────────────────────────────────────────────────
document.getElementById('btn-sensitivity').addEventListener('click', runSensitivity);

async function runSensitivity() {
    const vary = document.getElementById('sens-variable').value;
    const fixed = {
        credit_score: +document.getElementById('slider-credit').value,
        income: +document.getElementById('slider-income').value,
        dti: +document.getElementById('slider-dti').value,
        employment: +document.getElementById('slider-employment').value,
    };
    delete fixed[vary];

    const btn = document.getElementById('btn-sensitivity');
    btn.innerHTML = '<span class="loading-spinner"></span> Running...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/sensitivity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vary, fixed, steps: 80 }),
        });
        const data = await res.json();
        renderSensitivityChart(data);
    } catch (err) {
        console.error('Sensitivity error:', err);
    } finally {
        btn.innerHTML = '<i data-lucide="play"></i> Run Analysis';
        btn.disabled = false;
        lucide.createIcons();
    }
}

function renderSensitivityChart(data) {
    if (chartInstances['sensitivity']) chartInstances['sensitivity'].destroy();

    const ctx = document.getElementById('chart-sensitivity').getContext('2d');

    const pointColors = data.y.map(y =>
        y >= 65 ? '#15803d' : y >= 35 ? '#b45309' : '#b91c1c'
    );

    chartInstances['sensitivity'] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Approval Score',
                data: data.x.map((x, i) => ({ x, y: data.y[i] })),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 2.5,
                pointRadius: 2,
                pointBackgroundColor: pointColors,
                pointBorderColor: pointColors,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'linear', title: { display: true, text: VARIABLE_LABELS[data.variable] }, grid: { color: '#f1f5f9' } },
                y: { min: 0, max: 100, title: { display: true, text: 'Approval Score' }, grid: { color: '#f1f5f9' } },
            },
            plugins: {
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    titleFont: { weight: '700', family: "'Inter', sans-serif" },
                    bodyFont: { family: "'Fira Code', monospace" },
                    padding: 12,
                    callbacks: {
                        label: ctx => {
                            const y = ctx.parsed.y;
                            const decision = y >= 65 ? 'APPROVED' : y >= 35 ? 'REVIEW' : 'REJECTED';
                            return `Score: ${y.toFixed(1)} — ${decision}`;
                        }
                    }
                }
            }
        }
    });
}

async function loadAllSensitivity() {
    const fixed = {
        credit_score: 650,
        income: 75,
        dti: 35,
        employment: 5,
    };

    const variables = ['credit_score', 'income', 'dti', 'employment'];
    const colorSet = [COLORS.brand, COLORS.cyan, COLORS.amber, COLORS.red];
    const datasets = [];

    for (let i = 0; i < variables.length; i++) {
        const vary = variables[i];
        const fixedCopy = { ...fixed };
        delete fixedCopy[vary];

        try {
            const res = await fetch(`${API_BASE}/sensitivity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vary, fixed: fixedCopy, steps: 60 }),
            });
            const data = await res.json();

            const ranges = { credit_score: [300, 850], income: [0, 200], dti: [0, 100], employment: [0, 30] };
            const [lo, hi] = ranges[vary];

            datasets.push({
                label: VARIABLE_LABELS[vary],
                data: data.x.map((x, j) => ({ x: (x - lo) / (hi - lo) * 100, y: data.y[j] })),
                borderColor: colorSet[i].solid,
                backgroundColor: 'transparent',
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
            });
        } catch (err) {
            console.error(`Sensitivity fetch error for ${vary}:`, err);
        }
    }

    if (chartInstances['sensitivity-all']) chartInstances['sensitivity-all'].destroy();

    const ctx = document.getElementById('chart-sensitivity-all').getContext('2d');
    chartInstances['sensitivity-all'] = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'linear', min: 0, max: 100, title: { display: true, text: 'Variable Range (Normalized %)' }, grid: { color: '#f1f5f9' } },
                y: { min: 0, max: 100, title: { display: true, text: 'Approval Score' }, grid: { color: '#f1f5f9' } },
            },
            plugins: {
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    titleFont: { weight: '700', family: "'Inter', sans-serif" },
                    bodyFont: { family: "'Fira Code', monospace" },
                    padding: 12,
                }
            }
        }
    });
}
