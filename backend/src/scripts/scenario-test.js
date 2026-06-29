/**
 * scenario-test.js — Test all contract types with realistic deal scenarios
 *
 * Runs validation + PDF generation for each scenario.
 * Shows what addendums get selected and what issues are found.
 * NO RabbitSign API calls. NO emails. Local PDFs only.
 */

const path = require('path');
const { saveFilledPdf } = require('../services/pdf-generator');
const { validateContract } = require('../services/contract-validation');

// 6 realistic deal scenarios
const SCENARIOS = [
  {
    name: '1. Cash Offer — Simplest deal',
    contractType: 'cash',
    lead: {
      address: '412 Oak Ridge Dr, Richmond, VA 23220',
      city: 'Richmond', state: 'VA', zip: '23220',
      price: 125000, emd_amount: 500,
      seller_name: 'Margaret Chen', seller_email: 'mchen@test.com', seller_phone: '804-555-1100',
      buyer_name: 'Divinity Aligned LLC',
      inspection_period_days: 14, coe_days: 21,
    },
  },
  {
    name: '2. SubTo PSA — Existing conventional loan',
    contractType: 'subto',
    lead: {
      address: '2760 N 19th St, Milwaukee, WI 53206',
      city: 'Milwaukee', state: 'WI', zip: '53206',
      apn: '311-1833-000',
      price: 300000, emd_amount: 500,
      seller_name: 'DK Lindsey Holdings LLC', seller_email: 'dklindsey@test.com', seller_phone: '267-207-9545',
      buyer_name: 'Divinity Aligned LLC',
      inspection_period_days: 14, coe_days: 30,
      existing_loan_balance: 200000, existing_loan_type: 'Conventional', existing_loan_payment: 1235,
      seller_carryback: 99500, seller_carryback_rate: 0, monthly_payment: 276.39,
      maturity_date: 'August 1, 2056', maturity_months: 72, payment_start_date: 'August 1, 2026',
      cash_at_coe: 0,
      personal_property: 'All appliances to stay excluding washer and dryer',
      occupancy_status: 'Property is tenant-occupied under a lease expiring March 31, 2027',
    },
  },
  {
    name: '3. SubTo PSA — VA loan (triggers VA addendum)',
    contractType: 'subto',
    lead: {
      address: '8842 Veterans Pkwy, San Antonio, TX 78227',
      city: 'San Antonio', state: 'TX', zip: '78227',
      apn: '456-789-012',
      price: 195000, emd_amount: 1000,
      seller_name: 'Robert Martinez', seller_email: 'rmartinez@test.com', seller_phone: '210-555-2200',
      buyer_name: 'Divinity Aligned LLC',
      inspection_period_days: 14, coe_days: 30,
      existing_loan_balance: 145000, existing_loan_type: 'VA Loan', existing_loan_payment: 980,
      seller_carryback: 49000, seller_carryback_rate: 0, monthly_payment: 196,
      maturity_date: 'January 15, 2058', maturity_months: 84, payment_start_date: 'February 1, 2027',
      cash_at_coe: 0,
      personal_guarantee: true,
    },
  },
  {
    name: '4. Stack 50% — Multi-family with seller financing',
    contractType: 'stack50',
    lead: {
      address: '1500 Commerce St, Memphis, TN 38112',
      city: 'Memphis', state: 'TN', zip: '38112',
      price: 450000, emd_amount: 2000,
      seller_name: 'Memphis Property Group LLC', seller_email: 'mpg@test.com', seller_phone: '901-555-3300',
      buyer_name: 'Divinity Aligned LLC',
      inspection_period_days: 21, coe_days: 30,
      seller_carryback: 225000, seller_carryback_rate: 0.05, monthly_payment: 937.50,
      maturity_months: 60, maturity_date: 'July 1, 2031', payment_start_date: 'August 1, 2026',
      down_payment: 225000,
    },
  },
  {
    name: '5. JV 4-Party — Profit split deal',
    contractType: 'jv_4party',
    lead: {
      address: '2250 Highland Ave, Birmingham, AL 35205',
      city: 'Birmingham', state: 'AL', zip: '35205',
      price: 175000,
      seller_name: 'Highland Partners',
      buyer_name: 'Divinity Aligned LLC',
      party_a_name: 'Montelli Scott', party_a_email: 'montelliscottrei@gmail.com',
      party_b_name: 'Seth Clayton', party_b_email: 'seth@test.com',
      party_c_name: 'Jaxon Deason', party_c_email: 'jaxon@test.com',
      party_d_name: 'Kayla Mauser', party_d_email: 'kayla@test.com',
      party_a_percent: 40, party_b_percent: 20, party_c_percent: 20, party_d_percent: 20,
      managing_party: 'Party A',
      initial_capital: 5000, manager_authority_threshold: 2500,
      title_holding_name: 'Divinity Aligned JV Holdings LLC',
      party_a_expense: 1250, party_b_expense: 625, party_c_expense: 625, party_d_expense: 625,
      additional_terms: 'Party A to receive a $10,000 assignment fee at close of escrow. Party A to pay $5,000 to seller at close.',
      jv_purpose: 'To acquire, rehabilitate, and sell the Property located at 2250 Highland Ave, Birmingham, AL 35205',
    },
  },
  {
    name: '6. SubTo — Missing fields (should fail validation)',
    contractType: 'subto',
    lead: {
      address: '',
      price: 0,
      seller_name: '',
      buyer_name: 'Divinity Aligned LLC',
      existing_loan_type: 'VA Loan',
      seller_carryback: 50000,
    },
  },
];

async function main() {
  console.log('=== CONTRACT SCENARIO TESTS ===\n');

  for (const scenario of SCENARIOS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${scenario.name}`);
    console.log(`${'='.repeat(60)}\n`);

    // Run validation
    const validation = validateContract(scenario.contractType, scenario.lead);
    console.log(validation.summary);

    if (validation.issues.length > 0) {
      console.log('Issues:');
      for (const issue of validation.issues) {
        const icon = issue.severity === 'blocking' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${icon} ${issue.message}`);
        if (issue.proposedFix) console.log(`     Fix: ${issue.proposedFix}`);
      }
    }

    if (validation.addenda.length > 0) {
      console.log('\nConditional addendums:');
      for (const add of validation.addenda) {
        console.log(`  📎 ${add.name} — ${add.reason}`);
      }
    }

    if (!validation.valid) {
      console.log('\n⏭️  Skipped PDF generation (validation failed)');
      continue;
    }

    // Generate PDF
    const outputPath = path.resolve(__dirname, `../../scenario-test-${scenario.name.split('.')[0].trim()}.pdf`);
    try {
      const result = saveFilledPdf(scenario.contractType, scenario.lead, outputPath);
      console.log(`\n✅ PDF: ${result.path}`);
      console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.log(`\n❌ PDF generation failed: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('=== ALL SCENARIOS COMPLETE ===');
  console.log(`${'='.repeat(60)}\n`);
}

main();