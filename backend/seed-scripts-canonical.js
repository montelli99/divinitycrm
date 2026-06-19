// Seed canonical 12 text shortcuts + scripts verbatim from AIREI_MASTER_PLAYBOOK.md
// Source: prolificcapital/airei-course-notes/AIREI_MASTER_PLAYBOOK.md (Part 1, Part 2, Part 4, Part 6)

const { neon } = require('@neondatabase/serverless');
require('dotenv').config({path: __dirname + '/.env'});
const sql = neon(process.env.DATABASE_URL);

// All scripts verbatim from the master playbook
const SCRIPTS = [
  // ====== PART 1: 12 TEXT SHORTCUTS ======
  {
    id: 'int',
    name: 'INT - Intro Text',
    category: 'outreach',
    stage: 'LEAD_ENTERED',
    body: '{{seller_name}}, are you still accepting offers for {{address}}? My name is {{my_name}}, I\'m looking to purchase this as a rental for my portfolio.',
    merge_fields: ['seller_name', 'address', 'my_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'noa',
    name: 'NOA - No Answer (call 1-2)',
    category: 'outreach',
    stage: 'CONTACT_MADE',
    body: 'Are you still accepting offers for {{address}}?',
    merge_fields: ['address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'dnct',
    name: 'DNCT - Do Not Call Text',
    category: 'outreach',
    stage: 'LEAD_ENTERED',
    body: '{{seller_name}}, would you be opposed to accepting an offer for {{address}}? My name is {{my_name}}, I\'m looking at purchasing as a rental for my portfolio.',
    merge_fields: ['seller_name', 'address', 'my_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'ccc',
    name: 'CCC - Contact Card',
    category: 'outreach',
    stage: 'CONTACT_MADE',
    body: 'It is great aligning with you {{seller_name}}, I look forward to connecting the dots with you shortly at {{address}}. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life\'s Major Transitions',
    merge_fields: ['seller_name', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'gcj',
    name: 'GCJ - Group Chat w/ Kayla',
    category: 'outreach',
    stage: 'OFFER_SENT',
    body: '{{seller_name}} - happy {{day}}! Creating a group chat for the purchase on {{address}} with my business partner Kayla. She is currently in a meeting with our lender; The LOI will be coming from our partner at Homewithkaylamauser@gmail.com ; simply inform us it has been received for presentation, and also ensure to check other folders as well. Have a blessed rest of the week!',
    merge_fields: ['seller_name', 'day', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1 (canonical)',
  },
  {
    id: 'loi',
    name: 'LOI - Letter of Intent sent',
    category: 'outreach',
    stage: 'OFFER_SENT',
    body: 'Happy {{day}}! For the intent of my call — I have just now found some time to iron out any further details regarding the offer we had finalized. Have you gained any initial feedback from your seller just yet?',
    merge_fields: ['day'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'loi2days',
    name: 'LOI2DAYS - 2 days no reply',
    category: 'outreach',
    stage: 'OFFER_RECEIVED',
    body: 'Happy Sunday! I hate to be a bother — We spoke recently. I was curious: did you end up losing the listing or did your seller just give up on selling?',
    merge_fields: [],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'inloi',
    name: 'INLOI - Inspection after LOI',
    category: 'outreach',
    stage: 'OFFER_RECEIVED',
    body: '{{seller_name}}, thank you for the swift response – the photos online look great. I\'m sure they don\'t even do the property justice! We will set up a home inspection like any real estate purchase – within 24 hours. We are not willing to incur costs with a contractor/inspector when the seller could simply sell it to another buyer while I spend a few thousand dollars to do due diligence. As a business owner yourself, I can only hope this is understandable.',
    merge_fields: ['seller_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'f50',
    name: 'F50 - 50% down',
    category: 'outreach',
    stage: 'CONTACT_MADE',
    body: 'Happy {{day}}! I understand your intent to sell outright, would you be completely opposed to taking half your price now and the rest in one lump sum in the near future?',
    merge_fields: ['day'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'f10',
    name: 'F10 - 10% down 24mo',
    category: 'outreach',
    stage: 'CONTACT_MADE',
    body: 'Happy {{day}}! I understand your intent to sell outright, would you be completely opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?',
    merge_fields: ['day'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'pend',
    name: 'PEND - Property Pending',
    category: 'outreach',
    stage: 'LEAD_ENTERED',
    body: 'Happy {{day}}! I came across your listing at {{address}} and noticed it\'s pending. Congratulations, that\'s exciting! Wishing you a smooth closing — Feel free to keep my offer in your back pocket; I\'m intending to acquire this as a rental property. I\'m gonna give my DSCR Lender a quick call and send an offer over if I get approved. Feel free to browse through my closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life\'s Major Transitions',
    merge_fields: ['day', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },
  {
    id: 'sd',
    name: 'SD - Seller Declined',
    category: 'outreach',
    stage: 'DEAD',
    body: 'Happy {{day}}! Thank you for the update – feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants. Wishing you a smooth closing – feel free to keep us in mind for the future if you have listings that can\'t sell out right and are owned outright. This would be a great solution for homeowners who aren\'t seeing the outright number they\'re hoping for. Buy-box: Red States (Landlord Friendly) Turnkey Properties Single Family & Multi Family $150,000 - $550,000 3 bed + 10k + Population No HOA\'s No pools No flood zones',
    merge_fields: ['day'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 1',
  },

  // ====== PART 2: AGENT + SELLER SCRIPTS ======
  {
    id: 'agent_initial',
    name: 'Agent Initial Script',
    category: 'call_script',
    stage: 'CONTACT_MADE',
    body: `Smile. Happy {{day}}, I'm calling regarding the property at {{address}} — I'm interested in potentially purchasing this as a rental for my portfolio. I just have a couple questions — did I catch you at a good time?

Based on the photos online the property looks great inside and out, I'm SHOCKED it hasn't sold yet. Now.. Regarding other buyers who have walked it — have you received any feedback?

Interesting, okay – Regarding the roof and HVAC; when were those last installed?

Yeah it sounds great – now the property itself, is it currently occupied or vacant?

[If occupied]: Ask if the owner is living in it or if it is being rented out — If rented: What is the current rent? Thanks for clarifying – and when did they sign? What kind of lease are they on?

[If vacant]: Noted, and I am curious - it looks like a great house, why wouldn't the seller just rent it out and collect a couple thousand dollars each month?

Okay, that makes sense… Are utilities still on?

Awesome, thanks for all the info. I'm really interested in this property, and I would purchase outright by using a DSCR loan which is solely based on what it makes as a rental –As long as the rent covers the mortgage I'll be good to go at the price you're asking.

I'm going to give my lender a quick call and see how I can get approved. Is there a good email I can send over details to?

Great - thanks, it was great connecting with you, looking forward to aligning details with you shortly.`,
    merge_fields: ['day', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 3',
  },
  {
    id: 'seller_initial',
    name: 'Seller Initial Script',
    category: 'call_script',
    stage: 'CONTACT_MADE',
    body: `Happy {{day}}, my name is {{my_name}} are you still accepting offers at {{address}}?

Great - I'm interested in potentially purchasing this as a rental for my portfolio. I just have a couple questions - did I catch you at a good time?

Regarding the roof and HVAC; when were those last installed?

Yeah it sounds great – now the property itself, is it currently occupied or vacant?

[If occupied]: Ask if the owner is living in it or if it is being rented out — If rented: What is the current rent? Thanks for clarifying – and when did they sign? What kind of lease are they on?

[If vacant]: Noted, and I am curious - it looks like a great house, why wouldn't the seller just rent it out and collect a couple thousand dollars each month?`,
    merge_fields: ['day', 'address', 'my_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 3',
  },
  {
    id: 'seller_rehab',
    name: 'Seller REHAB Script',
    category: 'call_script',
    stage: 'CONTACT_MADE',
    body: `Happy {{day}}, my name is {{my_name}} I'm interested in potentially purchasing {{address}} -

Regarding the roof and HVAC, when were those last installed?

Good to know - the condition of the property. How would you rate it 10 being the best?

What would it need for it to be a 10?

Noted – now the property itself, is it currently occupied or vacant?

[If vacant - flip candidate]: Noted, and I am curious - it looks like it could be a good flip, what has you opposed to putting a few bucks in and making a profit?

Okay, that makes sense. Are utilities still on?

Thanks for all the information. Considering the fact the property needs renovation and most buyers couldn't qualify for bank financing, we wouldn't ask for any commissions since we aren't real estate agents. What are you looking to net on this price wise?

What is the best email I can send over details to?

Great - thanks, it was great connecting with you, looking forward to aligning details with you shortly.`,
    merge_fields: ['day', 'address', 'my_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 3',
  },

  // ====== PART 4: FOLLOW-UP SCRIPTS ======
  {
    id: 'post_offer_48hr',
    name: 'Post-Offer 48hr (no confirmation)',
    category: 'follow_up',
    stage: 'OFFER_SENT',
    body: `Happy {{day}} {{client_name}} I am just now finding some time to realign with you, we spoke {{day_we_spoke}} regarding the property at {{address}}. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?

[If they ask questions]: "Noted - what I'll do is relay this over to my business partner and will get back with you. I look forward to aligning the finer details with you" — TEXT KAYLA THESE QUESTIONS

[If they ask if we've viewed/walked the property]: "Our assistant drove past the property a few days back and referred it to us. The photos online look great. I'm sure they don't even do the property justice! We will set up a home inspection like any real estate transaction – within 24 hours."

[If agent/seller says "We want cash / no seller finance"]: "That's exactly why I'm calling {{agent_name}} – with the property still being listed for sale – your seller hasn't received sufficient offers from buyers who intend to live in the property; our lender has confirmed this will not be able to be a rental for anyone due to institutional interest rates – feel free to revisit this offer right before the listing agreement expires; I would love to get you paid for your efforts in selling this."

[After call]: Send "SD" text shortcut. Take Days on Market → subtract 181 → import into calendar → call when listing expires.`,
    merge_fields: ['day', 'client_name', 'day_we_spoke', 'address', 'agent_name'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 4',
  },
  {
    id: 'noa_after_2_calls',
    name: 'No Answer After 2 Calls (voice memo)',
    category: 'follow_up',
    stage: 'CONTACT_MADE',
    body: `Happy {{day}} {{client_name}} just tried to call you regarding the purchase of your property on {{address}}. I'm going to call my DSCR lender to get approved, they simply just look at the rental income. Going to loop you into a group chat with my business partner Kayla - have a blessed evening`,
    merge_fields: ['day', 'client_name', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 4',
  },
  {
    id: 'property_uc_followup',
    name: 'Property Went Under Contract (follow-up)',
    category: 'follow_up',
    stage: 'OFFER_SENT',
    body: `Happy {{day}} {{client_name}} We spoke on {{day_found_uc}} you mentioned the property at {{address}} went under contract. I just now found some time to ensure the buyer has wired earnest money and the inspections have since been completed.

[If closing]: "Congratulations, glad it all aligned well for you. It was great connecting with you and if you aren't opposed I'd love to explore the opportunities with you in the future. Our business model aligns well with properties that are owned outright or are facing a short sale. Looking forward to providing value alongside you in the future."

[If fell apart]: "Noted, I had made a note for our underwriters to keep this offer valid though the sellers inspections. Looking forward to getting this across the finish line with you soon."`,
    merge_fields: ['day', 'client_name', 'day_found_uc', 'address'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 4',
  },
  {
    id: 'good_standing',
    name: 'Good Standing (delay in feedback)',
    category: 'follow_up',
    stage: 'OFFER_SENT',
    body: 'Happy Wednesday! I appreciate your patience as we were in a few closings with clients the past few weeks; I have just now found some time to gain feedback from the offer we sent.',
    merge_fields: [],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 4',
  },

  // ====== PART 6: FB MARKETPLACE PROSPECTING ======
  {
    id: 'fb_initial',
    name: 'FB Marketplace - Initial Reply',
    category: 'outreach',
    stage: 'LEAD_ENTERED',
    body: `Happy {{day}} I appreciate the prompt communication, for this to be considered we will simply need to confirm the property address to ensure this is a rental that would make sense for an investment for our portfolio as well as your email address and phone number so that our transaction coordinator can send over the agreement for authorization if we align on it being a great fit; please message me with the property address, the best email address and phone number to contact you at – rest assured we will only contact you if the property fits our criteria`,
    merge_fields: ['day'],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 6',
  },

  // ====== PART 7: JV/AGREEMENT (closing) ======
  {
    id: 'closing_thank_you',
    name: 'Closing - Thank You + Ask for Referrals',
    category: 'seller_update',
    stage: 'CLOSING_DATE',
    body: 'Congratulations on the close! We were honored to assist. Two quick things: 1) Any other properties you\'re looking to offload? (we do double/triple/quadruple dip) 2) Anyone in your network who might be a fit? We pay referral fees.',
    merge_fields: [],
    source: 'AIREI_MASTER_PLAYBOOK.md Part 2 (Step 12)',
  },

  // ====== SELLER MONITORING (post-terms) ======
  {
    id: 'seller_monitor_3to5',
    name: 'Seller Monitoring (3-5 days post-Terms)',
    category: 'follow_up',
    stage: 'TERMS_AGREED',
    body: `Hey {{seller_name}} — just checking in — everything smooth on your end?

(Use every 3-5 days until close. First check-in after Kayla sends contract.)`,
    merge_fields: ['seller_name'],
    source: 'Course transcripts 17A, 17B, 17C + memory/KAYLA_CLOSING_PROCESS.md',
  },
];

(async()=>{
  let inserted = 0, updated = 0;
  for (const s of SCRIPTS) {
    const r = await sql(
      `INSERT INTO script_templates (id, name, category, stage, body, merge_fields, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::text[], NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         stage = EXCLUDED.stage,
         body = EXCLUDED.body,
         merge_fields = EXCLUDED.merge_fields
       RETURNING (xmax = 0) AS was_insert`,
      [s.id, s.name, s.category, s.stage, s.body, s.merge_fields]
    );
    if (r[0].was_insert) inserted++; else updated++;
  }
  console.log('Inserted:', inserted, 'Updated:', updated, 'Total:', SCRIPTS.length);
})().catch(e=>{console.error('ERR:',e.message);process.exit(1)});
