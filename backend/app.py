"""
Fuzzy Logic Loan Approval System - Backend
Uses scikit-fuzzy for fuzzy inference engine
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
import json

app = Flask(__name__)
CORS(app)

# ── Fuzzy Logic System Setup ────────────────────────────────────────────────

def build_fuzzy_system():
    """Build the fuzzy inference system for loan approval."""

    # Define universe of discourse for each variable
    credit_score = ctrl.Antecedent(np.arange(300, 851, 1), 'credit_score')
    income = ctrl.Antecedent(np.arange(0, 201, 1), 'income')  # in thousands
    dti = ctrl.Antecedent(np.arange(0, 101, 1), 'dti')  # debt-to-income %
    employment = ctrl.Antecedent(np.arange(0, 31, 1), 'employment')  # years

    approval = ctrl.Consequent(np.arange(0, 101, 1), 'approval')

    # ── Membership Functions ──

    # Credit Score: Poor, Fair, Good, Excellent
    credit_score['poor'] = fuzz.trapmf(credit_score.universe, [300, 300, 450, 550])
    credit_score['fair'] = fuzz.trimf(credit_score.universe, [450, 575, 700])
    credit_score['good'] = fuzz.trimf(credit_score.universe, [600, 725, 800])
    credit_score['excellent'] = fuzz.trapmf(credit_score.universe, [750, 800, 850, 850])

    # Income (in thousands): Low, Medium, High
    income['low'] = fuzz.trapmf(income.universe, [0, 0, 25, 50])
    income['medium'] = fuzz.trimf(income.universe, [30, 75, 120])
    income['high'] = fuzz.trapmf(income.universe, [90, 140, 200, 200])

    # Debt-to-Income Ratio: Low, Medium, High
    dti['low'] = fuzz.trapmf(dti.universe, [0, 0, 15, 30])
    dti['medium'] = fuzz.trimf(dti.universe, [20, 40, 60])
    dti['high'] = fuzz.trapmf(dti.universe, [45, 65, 100, 100])

    # Employment Years: Short, Medium, Long
    employment['short'] = fuzz.trapmf(employment.universe, [0, 0, 1, 4])
    employment['medium'] = fuzz.trimf(employment.universe, [2, 7, 15])
    employment['long'] = fuzz.trapmf(employment.universe, [10, 18, 30, 30])

    # Approval Score: Reject, Review, Approve
    approval['reject'] = fuzz.trapmf(approval.universe, [0, 0, 15, 35])
    approval['review'] = fuzz.trimf(approval.universe, [25, 50, 75])
    approval['approve'] = fuzz.trapmf(approval.universe, [65, 85, 100, 100])

    # ── Fuzzy Rules ──
    rules = [
        # Strong approval rules
        ctrl.Rule(credit_score['excellent'] & income['high'] & dti['low'], approval['approve']),
        ctrl.Rule(credit_score['excellent'] & income['high'] & dti['medium'], approval['approve']),
        ctrl.Rule(credit_score['excellent'] & income['medium'] & dti['low'], approval['approve']),
        ctrl.Rule(credit_score['good'] & income['high'] & dti['low'], approval['approve']),
        ctrl.Rule(credit_score['good'] & income['high'] & dti['medium'] & employment['long'], approval['approve']),
        ctrl.Rule(credit_score['excellent'] & employment['long'], approval['approve']),

        # Review rules
        ctrl.Rule(credit_score['good'] & income['medium'] & dti['medium'], approval['review']),
        ctrl.Rule(credit_score['good'] & income['medium'] & dti['low'], approval['review']),
        ctrl.Rule(credit_score['fair'] & income['high'] & dti['low'], approval['review']),
        ctrl.Rule(credit_score['fair'] & income['medium'] & dti['low'] & employment['long'], approval['review']),
        ctrl.Rule(credit_score['good'] & income['low'] & dti['low'] & employment['long'], approval['review']),
        ctrl.Rule(credit_score['fair'] & income['high'] & dti['medium'], approval['review']),

        # Rejection rules
        ctrl.Rule(credit_score['poor'] & dti['high'], approval['reject']),
        ctrl.Rule(credit_score['poor'] & income['low'], approval['reject']),
        ctrl.Rule(credit_score['poor'] & income['medium'] & dti['high'], approval['reject']),
        ctrl.Rule(credit_score['fair'] & income['low'] & dti['high'], approval['reject']),
        ctrl.Rule(credit_score['fair'] & dti['high'] & employment['short'], approval['reject']),
        ctrl.Rule(credit_score['good'] & dti['high'] & income['low'], approval['reject']),
        ctrl.Rule(credit_score['poor'] & employment['short'], approval['reject']),

        # Mixed / edge-case rules
        ctrl.Rule(credit_score['fair'] & income['medium'] & dti['medium'], approval['review']),
        ctrl.Rule(credit_score['good'] & income['high'] & dti['high'], approval['review']),
        ctrl.Rule(credit_score['fair'] & income['low'] & dti['medium'], approval['reject']),
        ctrl.Rule(credit_score['good'] & income['medium'] & dti['high'], approval['review']),
        ctrl.Rule(credit_score['excellent'] & dti['high'], approval['review']),
    ]

    system = ctrl.ControlSystem(rules)
    return system, credit_score, income, dti, employment, approval


# Build the system once at startup
fuzzy_system, cs_var, inc_var, dti_var, emp_var, appr_var = build_fuzzy_system()


def get_membership_data(variable, universe_label):
    """Extract membership function data for visualization."""
    data = {}
    for term_name, term_mf in variable.terms.items():
        mf_values = fuzz.interp_membership(variable.universe, term_mf.mf, variable.universe)
        data[term_name] = {
            'x': variable.universe.tolist(),
            'y': mf_values.tolist()
        }
    return data


def evaluate_applicant(credit, inc, debt_ratio, emp_years):
    """Run fuzzy inference for a single applicant."""
    sim = ctrl.ControlSystemSimulation(fuzzy_system)
    sim.input['credit_score'] = credit
    sim.input['income'] = inc
    sim.input['dti'] = debt_ratio
    sim.input['employment'] = emp_years

    try:
        sim.compute()
        score = float(sim.output['approval'])
    except Exception:
        score = 0.0

    # Compute membership degrees for inputs
    cs_memberships = {}
    for term in cs_var.terms:
        cs_memberships[term] = float(fuzz.interp_membership(
            cs_var.universe, cs_var[term].mf, credit))

    inc_memberships = {}
    for term in inc_var.terms:
        inc_memberships[term] = float(fuzz.interp_membership(
            inc_var.universe, inc_var[term].mf, inc))

    dti_memberships = {}
    for term in dti_var.terms:
        dti_memberships[term] = float(fuzz.interp_membership(
            dti_var.universe, dti_var[term].mf, debt_ratio))

    emp_memberships = {}
    for term in emp_var.terms:
        emp_memberships[term] = float(fuzz.interp_membership(
            emp_var.universe, emp_var[term].mf, emp_years))

    appr_memberships = {}
    for term in appr_var.terms:
        appr_memberships[term] = float(fuzz.interp_membership(
            appr_var.universe, appr_var[term].mf, score))

    # Decision
    if score >= 65:
        decision = "APPROVED"
    elif score >= 35:
        decision = "REVIEW"
    else:
        decision = "REJECTED"

    return {
        'score': round(score, 2),
        'decision': decision,
        'memberships': {
            'credit_score': cs_memberships,
            'income': inc_memberships,
            'dti': dti_memberships,
            'employment': emp_memberships,
            'approval': appr_memberships
        }
    }


# ── Demo Dataset ────────────────────────────────────────────────────────────

DEMO_DATASET = [
    {"id": 1, "name": "Alice Mercer",      "credit_score": 780, "income": 120, "dti": 18, "employment": 12, "loan_amount": 250000, "purpose": "Home Purchase"},
    {"id": 2, "name": "Bob Chen",           "credit_score": 650, "income": 65,  "dti": 42, "employment": 5,  "loan_amount": 30000,  "purpose": "Auto Loan"},
    {"id": 3, "name": "Carol Davis",        "credit_score": 720, "income": 95,  "dti": 28, "employment": 8,  "loan_amount": 180000, "purpose": "Home Purchase"},
    {"id": 4, "name": "Derek Johnson",      "credit_score": 480, "income": 35,  "dti": 68, "employment": 1,  "loan_amount": 15000,  "purpose": "Personal Loan"},
    {"id": 5, "name": "Eva Martinez",       "credit_score": 810, "income": 180, "dti": 12, "employment": 20, "loan_amount": 500000, "purpose": "Home Purchase"},
    {"id": 6, "name": "Frank Wilson",       "credit_score": 590, "income": 48,  "dti": 55, "employment": 3,  "loan_amount": 25000,  "purpose": "Debt Consolidation"},
    {"id": 7, "name": "Grace Lee",          "credit_score": 700, "income": 85,  "dti": 35, "employment": 10, "loan_amount": 45000,  "purpose": "Auto Loan"},
    {"id": 8, "name": "Hank Patel",         "credit_score": 550, "income": 42,  "dti": 48, "employment": 2,  "loan_amount": 20000,  "purpose": "Personal Loan"},
    {"id": 9, "name": "Iris Thompson",      "credit_score": 830, "income": 155, "dti": 10, "employment": 25, "loan_amount": 400000, "purpose": "Home Purchase"},
    {"id": 10,"name": "Jack Robinson",      "credit_score": 620, "income": 55,  "dti": 38, "employment": 4,  "loan_amount": 35000,  "purpose": "Business Loan"},
    {"id": 11,"name": "Kelly Nguyen",       "credit_score": 740, "income": 110, "dti": 22, "employment": 15, "loan_amount": 200000, "purpose": "Home Purchase"},
    {"id": 12,"name": "Liam O'Brien",       "credit_score": 460, "income": 28,  "dti": 72, "employment": 0,  "loan_amount": 10000,  "purpose": "Personal Loan"},
    {"id": 13,"name": "Mia Sanchez",        "credit_score": 690, "income": 78,  "dti": 30, "employment": 6,  "loan_amount": 150000, "purpose": "Home Purchase"},
    {"id": 14,"name": "Noah Kim",           "credit_score": 760, "income": 130, "dti": 15, "employment": 18, "loan_amount": 300000, "purpose": "Home Purchase"},
    {"id": 15,"name": "Olivia Brown",       "credit_score": 520, "income": 40,  "dti": 60, "employment": 1,  "loan_amount": 18000,  "purpose": "Auto Loan"},
]


# ── API Routes ──────────────────────────────────────────────────────────────

@app.route('/api/membership-functions', methods=['GET'])
def get_membership_functions():
    """Return all membership function data for chart rendering."""
    data = {
        'credit_score': {
            'label': 'Credit Score',
            'range': [300, 850],
            'functions': get_membership_data(cs_var, 'credit_score')
        },
        'income': {
            'label': 'Annual Income ($K)',
            'range': [0, 200],
            'functions': get_membership_data(inc_var, 'income')
        },
        'dti': {
            'label': 'Debt-to-Income Ratio (%)',
            'range': [0, 100],
            'functions': get_membership_data(dti_var, 'dti')
        },
        'employment': {
            'label': 'Employment (Years)',
            'range': [0, 30],
            'functions': get_membership_data(emp_var, 'employment')
        },
        'approval': {
            'label': 'Approval Score',
            'range': [0, 100],
            'functions': get_membership_data(appr_var, 'approval')
        }
    }
    return jsonify(data)


@app.route('/api/evaluate', methods=['POST'])
def evaluate():
    """Evaluate a single loan application."""
    body = request.json
    result = evaluate_applicant(
        credit=float(body['credit_score']),
        inc=float(body['income']),
        debt_ratio=float(body['dti']),
        emp_years=float(body['employment'])
    )
    return jsonify(result)


@app.route('/api/demo-dataset', methods=['GET'])
def demo_dataset():
    """Return the demo dataset with fuzzy evaluation results."""
    results = []
    for applicant in DEMO_DATASET:
        evaluation = evaluate_applicant(
            credit=applicant['credit_score'],
            inc=applicant['income'],
            debt_ratio=applicant['dti'],
            emp_years=applicant['employment']
        )
        results.append({**applicant, **evaluation})
    return jsonify(results)


@app.route('/api/batch-evaluate', methods=['POST'])
def batch_evaluate():
    """Evaluate multiple applicants at once."""
    applicants = request.json.get('applicants', [])
    results = []
    for a in applicants:
        evaluation = evaluate_applicant(
            credit=float(a['credit_score']),
            inc=float(a['income']),
            debt_ratio=float(a['dti']),
            emp_years=float(a['employment'])
        )
        results.append({**a, **evaluation})
    return jsonify(results)


@app.route('/api/sensitivity', methods=['POST'])
def sensitivity_analysis():
    """Run sensitivity analysis: vary one input, fix others."""
    body = request.json
    vary = body['vary']  # which variable to vary
    fixed = body['fixed']  # dict of fixed values
    steps = int(body.get('steps', 50))

    ranges = {
        'credit_score': (300, 850),
        'income': (0, 200),
        'dti': (0, 100),
        'employment': (0, 30)
    }

    lo, hi = ranges[vary]
    x_values = np.linspace(lo, hi, steps).tolist()
    y_values = []

    for val in x_values:
        inputs = {**fixed, vary: val}
        result = evaluate_applicant(
            credit=inputs['credit_score'],
            inc=inputs['income'],
            debt_ratio=inputs['dti'],
            emp_years=inputs['employment']
        )
        y_values.append(result['score'])

    return jsonify({
        'variable': vary,
        'x': x_values,
        'y': y_values
    })


if __name__ == '__main__':
    print("[*] Fuzzy Logic Loan Approval API running on http://localhost:5000")
    app.run(debug=True, port=5000)
