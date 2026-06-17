// =============================================================
// Training Route — AI REI Master Playbook Content
// =============================================================

const express = require('express');
const router = express.Router();

// All training modules from the AI REI Master Playbook
const TRAINING_MODULES = [
  {
    id: 'part1',
    title: 'Part 1: The Full Process (Lead → Hand-off)',
    icon: '🔄',
    sections: [
      {
        title: 'Step 1 — Email & Contact Setup',
        content: `Set up your professional email: HomewithFirst&LastName@gmail.com

**Signature format:**
"Highest Regards,
[First & Last Name]
Real Estate Investor | Multifamily
Cell: [Your Cell]
Our Website: Divinity Aligned LLC: Expert Solutions for Life's Major Transitions"

**Contact Card Setup:**
- Set up contact card on phone with headshot
- In notes: recent closings for credibility
- Email Kayla to get CRM portal access + office hours + follow-up dials`,
      },
      {
        title: 'Step 2 — Text Shortcuts (iPhone)',
        content: `Settings → Text Replacement → Add phrases:

| Shortcut | Purpose |
|----------|---------|
| **INT** | Intro text before calling |
| **NOA** | No Answer follow-up |
| **DNCT** | Do Not Call Text |
| **CCC** | Contact Card after call |
| **GCJ** | Group Chat w/ Jaxon |
| **LOI** | Letter of Intent sent |
| **LOI2DAYS** | 2 days no reply |
| **INLOI** | Inspection after LOI |
| **F50** | Facebook 50% down pitch |
| **F10** | Facebook 10% down pitch |
| **PEND** | Property Pending |
| **SD** | Seller Declined |

**Always send INT before calling** — so your name pops up as caller ID instead of "Unknown Caller"`,
      },
      {
        title: 'Step 3 — Evaluate the Property',
        content: `1. Copy property address → Google → Zillow
2. Check population: must be **≥ 10,000 people** (ask Google or ChatGPT)
3. If population < 10K → discard lead
4. Note condition: turnkey / needs renovation / livable
5. Check rental comps on Zillow Rent Estimate / Rentometer`,
      },
      {
        title: 'Step 4 — Enter Lead in CRM',
        content: `- Opportunity Name = property address
- Take detailed notes from the lead sheet
- Enter: agent name, phone, email, roof/HVAC, occupancy, rental info
- Add updates as they come (latest notes, rent rolls, financials, P&L statements)`,
      },
      {
        title: 'Step 5 — Contact Client',
        content: `**Before calling:** Send "INT" text shortcut first

**Call the client twice.** If no answer both times, send voice memo:
"Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. I'm going to give my lender a quick call, they only look at servicing the debt based on the rental income with a DSCR loan. To streamline the communication I will loop you in with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer."

**Save client in phone:** contact type (Agent/Seller) + property address in company line`,
      },
      {
        title: 'Step 6 — Take Notes During Call',
        content: `Collect during the call:
- Agent name, phone, email
- Seller name, phone, email (ask directly if not provided)
- Roof and HVAC age/condition
- Current rent (if occupied)
- Lease type and term
- Utilities status
- Feedback from other buyers who walked the property
- Whether seller would consider creative terms (seller finance, 50% down, etc.)`,
      },
      {
        title: 'Step 7 — After Call: Send CCC',
        content: `Send "CCC" text shortcut + your contact card after EVERY call.

This builds credibility and keeps the relationship warm.`,
      },
      {
        title: 'Step 8 — Evaluate Deal Type',
        content: `**If turnkey / move-in ready:**
- Propose **F50** (50% down at close, balance in lump sum) or **F10** (10% down, payoff in 24 months)
- Check rental comps. Rule: rent must be ~1% of purchase price
- If it passes underwriting → email Seth: claytoninvestmentsolutions@gmail.com, subject "FB LOI Request"

**If needs renovation:**
- Email Seth: claytoninvestmentsolutions@gmail.com, subject "Renovation – LOI Request [address]"
- Include: market rent estimate, purchase price, rehab estimate
- Seth sends approved LOI if it passes underwriting`,
      },
      {
        title: 'Step 9 — Create Group Chat',
        content: `Send "GCJ" text shortcut → loops Jaxon + client into group chat.

This is the hand-off point. Jaxon handles the closing process from here.`,
      },
      {
        title: 'Step 10 — End-of-Day Spreadsheet',
        content: `For all leads called today:
1. Create new Google Sheet with lead status + all data
2. Email to Kayla + Jaxon: homewithkaylamauser@gmail.com + JaxonDeasonHomes1@gmail.com
3. Confirm all clients are in group chats for proper hand-off`,
      },
      {
        title: 'Step 11 — Follow-Up (48hr After Offer)',
        content: `After 48 hours with no confirmation:
- Call client. If they don't answer both times → send voice memo
- Follow the "Post-Offer Script"
- Text "SD" and note the Days on Market → subtract 181 → put in calendar to call when listing expires`,
      },
      {
        title: 'Step 12 — Closed / Archived',
        content: `Once deal closes → archive in CRM

**Always ask:** "Do you have any other properties you're looking to offload?"
This is how you double/triple/quadruple dip — one seller can lead to multiple deals.`,
      },
    ],
  },
  {
    id: 'part2',
    title: 'Part 2: Call Scripts',
    icon: '📞',
    sections: [
      {
        title: 'Agent Initial Script',
        content: `"Smile. Happy [day], I'm calling regarding the property at [address] — I'm interested in potentially purchasing this as a rental for my portfolio. I just have a couple questions — did I catch you at a good time?

Based on the photos online the property looks great inside and out, I'm SHOCKED it hasn't sold yet. Now.. Regarding other buyers who have walked it — have you received any feedback?

Interesting, okay – Regarding the roof and HVAC; when were those last installed?

Yeah it sounds great – now the property itself, is it currently occupied or vacant?"

**If occupied:**
"Ask if the owner is living in it or if it is being rented out — If rented: What is the current rent? Thanks for clarifying – and when did they sign? What kind of lease are they on?"

**If vacant:**
"Noted, and I am curious - it looks like a great house, why wouldn't the seller just rent it out and collect a couple thousand dollars each month?"

**Then:**
"Okay, that makes sense… Are utilities still on?

Awesome, thanks for all the info. I'm really interested in this property, and I would purchase outright by using a DSCR loan which is solely based on what it makes as a rental –As long as the rent covers the mortgage I'll be good to go at the price you're asking.

I'm going to give my lender a quick call and see how I can get approved. Is there a good email I can send over details to?

Great - thanks, it was great connecting with you, looking forward to aligning details with you shortly."`,
      },
      {
        title: 'Seller Initial Script',
        content: `"Happy [day], my name is [your name] are you still accepting offers at [property address]?

Great - I'm interested in potentially purchasing this as a rental for my portfolio. I just have a couple questions - did I catch you at a good time?

Regarding the roof and HVAC; when were those last installed?

Yeah it sounds great – now the property itself, is it currently occupied or vacant?"

*(Same branching as Agent Script for occupied/vacant)*`,
      },
      {
        title: 'Seller REHAB Script',
        content: `"Happy [day], my name is [your name] I'm interested in potentially purchasing [property address] -

Regarding the roof and HVAC, when were those last installed?

Good to know - the condition of the property. How would you rate it 10 being the best?

What would it need for it to be a 10?

Noted – now the property itself, is it currently occupied or vacant?"

**If vacant (flip candidate):**
"Noted, and I am curious - it looks like it could be a good flip, what has you opposed to putting a few bucks in and making a profit?"

**Then:**
"Okay, that makes sense. Are utilities still on?

Thanks for all the information. Considering the fact the property needs renovation and most buyers couldn't qualify for bank financing, we wouldn't ask for any commissions since we aren't real estate agents. What are you looking to net on this price wise?

What is the best email I can send over details to?

Great - thanks, it was great connecting with you, looking forward to aligning details with you shortly."`,
      },
      {
        title: 'Post-Offer Follow-Up (48hr, no confirmation)',
        content: `"Happy [Day] [Client Name] I am just now finding some time to realign with you, we spoke [Day you spoke] regarding the property at [property address]. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?"

**If they ask questions:**
"Noted - what I'll do is relay this over to my business partner and will get back with you. I look forward to aligning the finer details with you" — TEXT JAXON THESE QUESTIONS

**If they ask if we've viewed/walked the property:**
"Our assistant drove past the property a few days back and referred it to us. The photos online look great. I'm sure they don't even do the property justice! We will set up a home inspection like any real estate transaction – within 24 hours."

**If agent/seller says "We want cash / no seller finance":**
"That's exactly why I'm calling [agent name] – with the property still being listed for sale – your seller hasn't received sufficient offers from buyers who intend to live in the property; our lender has confirmed this will not be able to be a rental for anyone due to institutional interest rates – feel free to revisit this offer right before the listing agreement expires; I would love to get you paid for your efforts in selling this."

**After call:** Send "SD" text shortcut. Take Days on Market → subtract 181 → import into calendar → call when listing expires.`,
      },
      {
        title: 'If No Answer After 2 Calls',
        content: `Send voice note:
"Happy [Day] [Client Name] just tried to call you regarding the purchase of your property on [address]. I'm going to call my DSCR lender to get approved, they simply just look at the rental income. Going to loop you into a group chat with my business partner Jaxon - have a blessed evening"`,
      },
      {
        title: 'If Property Went Under Contract',
        content: `"Happy [day] [client name] We spoke on [day you found it went UC] you mentioned the property at [address] went under contract. I just now found some time to ensure the buyer has wired earnest money and the inspections have since been completed."

**If closing:** "Congratulations, glad it all aligned well for you. It was great connecting with you and if you aren't opposed I'd love to explore the opportunities with you in the future."

**If fell apart:** "Noted, I had made a note for our underwriters to keep this offer valid though the sellers inspections. Looking forward to getting this across the finish line with you soon."`,
      },
    ],
  },
  {
    id: 'part3',
    title: 'Part 3: Text Shortcuts Reference',
    icon: '💬',
    sections: [
      {
        title: 'INT — Intro',
        content: `**When:** Send before calling (so your name pops up as caller ID)

"[Name], are you still accepting offers for [address]? My name is [your name], I'm looking to purchase this as a rental for my portfolio."`,
      },
      {
        title: 'NOA — No Answer',
        content: `**When:** Client didn't answer

"Are you still accepting offers for [address]?"`,
      },
      {
        title: 'DNCT — Do Not Call Text',
        content: `**When:** Alternative intro

"[Name], would you be opposed to accepting an offer for [address]? My name is [name], I'm looking at purchasing as a rental for my portfolio."`,
      },
      {
        title: 'CCC — Contact Card',
        content: `**When:** After EVERY call

"It is great aligning with you [name], I look forward to connecting the dots with you shortly at [address]. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life's Major Transitions"`,
      },
      {
        title: 'GCJ — Group Chat w/ Jaxon',
        content: `**When:** Handing off to closer

"[Name] - happy [day]! Creating a group chat for the purchase on [address] with my business partner Jaxon. He is currently in a meeting with our lender; The LOI will be coming from our partner at Homewithkaylamauser@gmail.com ; simply inform us it has been received for presentation, and also ensure to check other folders as well. Have a blessed rest of the week!"`,
      },
      {
        title: 'LOI — Letter of Intent Sent',
        content: `**When:** Following up after LOI sent

"Happy [day]! For the intent of my call — I have just now found some time to iron out any further details regarding the offer we had finalized. Have you gained any initial feedback from your seller just yet?"`,
      },
      {
        title: 'LOI2DAYS — 2 Days No Reply',
        content: `**When:** 2 days after LOI with no response

"Happy Sunday! I hate to be a bother — We spoke recently. I was curious: did you end up losing the listing or did your seller just give up on selling?"`,
      },
      {
        title: 'INLOI — Inspection after LOI',
        content: `**When:** Seller wants inspection before LOI

"[Name], thank you for the swift response – the photos online look great. I'm sure they don't even do the property justice! We will set up a home inspection like any real estate purchase – within 24 hours. We are not willing to incur costs with a contractor/inspector when the seller could simply sell it to another buyer while I spend a few thousand dollars to do due diligence. As a business owner yourself, I can only hope this is understandable."`,
      },
      {
        title: 'F50 — Facebook 50% Down',
        content: `**When:** Pitching F50 on FB Marketplace

"Happy [day]! I understand your intent to sell outright, would you be completely opposed to taking half your price now and the rest in one lump sum in the near future?"`,
      },
      {
        title: 'F10 — Facebook 10% Down',
        content: `**When:** Pitching F10 on FB Marketplace

"Happy [day]! I understand your intent to sell outright, would you be completely opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?"`,
      },
      {
        title: 'PEND — Property Pending',
        content: `**When:** Property is pending/under contract

"Tami, happy Thursday! I came across your listing at [address] and noticed it's pending. Congratulations, that's exciting! Wishing you a smooth closing — Feel free to keep my offer in your back pocket; I'm intending to acquire this as a rental property."`,
      },
      {
        title: 'SD — Seller Declined',
        content: `**When:** Seller declined offer

"Happy Wednesday! Thank you for the update – feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants. Wishing you a smooth closing – feel free to keep us in mind for the future if you have listings that can't sell out right and are owned outright."

**Buy-box reminder included:**
Red States (Landlord Friendly) | Turnkey Properties | Single Family & Multi Family | $150,000 - $550,000 | 3 bed + | 10k + Population | No HOA's | No pools | No flood zones`,
      },
    ],
  },
  {
    id: 'part4',
    title: 'Part 4: Deal Types Explained',
    icon: '💰',
    sections: [
      {
        title: 'Cash Deals',
        content: `**Formula:** ARV × 0.70 − Repairs − Wholesale Fee = Max Offer

- Must get property at **deep discount** — wholesale price minus $10K minimum
- Example: $190K ARV, $35K rehab → max offer ~$30K
- Cash deals only work if you can get them at significant discount
- Best for: high motivation sellers who need to close fast`,
      },
      {
        title: 'F50 — 50% Stack Method (Seller Finance)',
        content: `**Structure:** 50% down at closing + 50% in 24 months (balloon)

- **Minimum equity required: 65%** (so seller nets after your down payment)
- Must have no mortgage on property (free and clear)
- Check equity at propwire.com
- Best for: turnkey/move-in ready properties
- Seller gets half now, half later — feels like they got their number`,
      },
      {
        title: 'F10 — 10% Down Seller Finance',
        content: `**Structure:** 10% (or 0-15%) down, seller carries balance for 24 months

- Down payment must cover seller's remaining equity
- Need: free and clear property + seller open to terms
- Balance payoff timing: "Our goal is to ensure it gets paid off quickly, it simply just depends on the rental income"
- Best for: renovation/flip properties where seller has high equity`,
      },
      {
        title: 'Subject-To (SubTo)',
        content: `**Structure:** Take over existing mortgage debt

- Typically 72+ months to pay off
- Need: low equity property (they owe close to what it's worth and can't sell traditionally)
- Best for: people missing payments, facing foreclosure, need to get out
- **Do NOT say "subject to" over the phone** — people get scared. Be transparent in person/documentation.
- Requires: Subject To Addendum with 4-layer seller protection
- Third-party payment processor set up within 48hrs of close`,
      },
      {
        title: 'DSCR Loan',
        content: `**Structure:** Bank financing based on rental income (not personal income)

- DSCR = Debt Service Coverage Ratio
- Formula: (Monthly Rent × 0.75) / Monthly Debt Service
- Must be ≥ 1.25x
- Max mortgage = (DSCR Monthly / 1.25) × 1000 / 5.6
- Best for: properties with strong rental income
- Requires: appraisal, bank underwriting`,
      },
      {
        title: 'Mid-Term Rental Pivot',
        content: `**When:** Long-term rental doesn't pass 1% rule

1. Go to Furnished Finder: https://www.furnishedfinder.com/
2. Search by zip code in 1-mile radius
3. Find already-rented furnished properties with same bed/bath
4. Take the LOWEST rate in the area, multiply by bedrooms (FF is by-room)
5. Insurance = $120/mo (fixed for furnished)
6. DSCR ≥ 1.25, Cash flow ≥ $200/mo

**Example:** 8 E Tunbridge Ct, Johnson City TN — long-term rent below 1% rule, but Furnished Finder shows $1,500/room × 3 rooms = $4,500/mo`,
      },
      {
        title: 'The Underwriting Quick Formula',
        content: `Use ChatGPT for quick underwriting:

1. Find ARV (similar sold properties on Redfin/Zillow in same neighborhood)
2. Multiply ARV × 0.70
3. Subtract repair estimate → that's what an investor would pay
4. Subtract wholesale fee → that's your max offer

**Always check:**
- 1% Rule: Monthly rent ≥ 1% of purchase price
- DSCR: ≥ 1.25x
- Cash Flow: ≥ $200/mo after all debt service`,
      },
    ],
  },
  {
    id: 'part5',
    title: 'Part 5: Underwriting — How Seth Evaluates Deals',
    icon: '🔍',
    sections: [
      {
        title: 'The 5 Key Formulas',
        content: `**Formula 1: Lender Value**
Purchase Price × 0.70 (70% LTV, hard rule)
This is the loan amount the lender will give based on PP, NOT ARV.

**Formula 2: Interest-Only Monthly Payment**
Loan × Rate / 12
Used for Subject-To + Stack + any seller carryback offer.

**Formula 3: $200/mo Minimum Cash Flow**
The deal is "a deal" if cash flow ≥ $200 after all debt service.

**Formula 4: $120/mo Insurance Default**
Always $120 unless otherwise specified (e.g., flood zone = higher).

**Formula 5: Full Cash Flow Calculation**
CF = Gross Rent − P&I − Insurance − Taxes`,
      },
      {
        title: 'Exit Strategy Decision Tree',
        content: `From Kay's actual cheatsheet:

| Strategy | Condition |
|----------|-----------|
| **Cash** | High motivation (seller wants out fast) |
| **Subject To** | Low equity AND low interest rate |
| **Stack 50%** | Equity over 50% AND move-in ready house |
| **Stack 10%** | Equity over 90% AND a flip (needs renovation) |
| **Novation** | Move-in ready house with no motivation |
| **$0 Down** | Rental AND owned outright / free and clear |

**Default:** Stack 50% if no other rule matches`,
      },
      {
        title: 'Buy Box Criteria',
        content: `Every lead must pass the buy box:

✅ **Red State** (Landlord Friendly): AL, AK, AR, AZ, FL, GA, ID, IN, IA, KS, KY, LA, MS, MO, MT, NE, NV, NC, ND, OK, SC, SD, TN, TX, UT, WV, WY

✅ **Population ≥ 10,000**

✅ **No HOA**

✅ **No Pools**

✅ **No Flood Zones**

✅ **$150,000 - $550,000 price range**

✅ **3+ bedrooms**

✅ **Single Family or Multi Family**

If any check fails → discard the lead.`,
      },
      {
        title: 'Kayla\'s Comp Methodology',
        content: `**Long-Term (cash/rental) flow:**
1. Zillow: get property listing (beds, baths, sqft, year built)
2. Zillow: HIDE active rentals. Look for already-rented properties
3. Find the CLOSEST property with the SAME bed/bath that is rented
4. ChatGPT: taxes = "If I bought this for $X in Y, what would I pay in property taxes in 2026?" Take the HIGHEST estimate
5. ChatGPT: typical landlord insurance for a SFR in the area
6. Loan = purchase × 0.7 (Jax 70% LTV)
7. Cash flow ≥ $200/mo (Kayla bar)

**Mid-Term (furnished) flow:**
1. Property basics lookup
2. Furnished Finder: search by zip code in 1-mile radius
3. Get LOWEST rate in the area, multiply by bedrooms
4. ChatGPT: taxes (HIGHEST estimate)
5. Insurance = $120/mo (fixed for furnished)
6. Loan = purchase × 0.7
7. DSCR ≥ 1.25, Cash flow ≥ $200/mo`,
      },
    ],
  },
  {
    id: 'part6',
    title: 'Part 6: Closing Process',
    icon: '🔐',
    sections: [
      {
        title: 'Acceptance to Closing Pipeline',
        content: `**1. Acceptance**
- Kay sends agreement to transaction coordinator
- TC sends to client for authorization
- Inform Kayla if you want fee in LLC name (instead of personal name)
- Kayla sends JV/consulting agreement outlining profit split

**2. Inspection + Appraisal**
- Kay arranges home inspector + sewer scope
- After completed, appraisal ordered
- Montelli contacts title for wiring instructions

**3. Consulting Agreement**
- Sent after property passes inspection + appraisal
- Signed by Kayla + Mentee
- Sent to title by TC

**4. Close of Escrow**
- All funds distributed at title company
- Direct deposit`,
      },
      {
        title: 'Novation Process',
        content: `Novation = assigning the purchase contract to another buyer

- Used when: move-in ready house with no motivation (no timeline to sell)
- You get the property under contract, then assign to an end buyer
- Your profit = assignment fee
- Requires: commercial PSA, novation agreement`,
      },
      {
        title: 'Title & Wire Setup',
        content: `**Title Company:**
- Primary: CLOSE Title
- Alternate (out-of-state): Eastern Title

**Wire Instructions:**
- Montelli contacts title for wiring instructions after appraisal
- All funds distributed at title company via direct deposit
- JV agreement outlines profit split percentages`,
      },
      {
        title: 'Subject-To Closing Specifics',
        content: `**Required at closing:**
1. PSA Creative SubTo (full purchase agreement)
2. Subject To Addendum (wrap-around financing disclosure)
3. Deed in Lieu of Foreclosure (held in escrow)
4. Third-party payment processor set up within 48hrs

**Key protections for seller:**
- If buyer ever misses a payment, property returns to seller without court/foreclosure
- All payments automated by bookkeeper
- Seller remains liable on existing loan but payments are handled
- Wrap-around financing is non-recourse
- Due-on-sale clause disclosed transparently`,
      },
      {
        title: 'Post-Close Lifecycle',
        content: `**+7 days:** Request testimonial / Google review
**+14 days:** Request referrals ($500 referral check)
**+30 days:** "Pokémon" engine — scan buyer database for local cash buyers matching property's buy box

**Always ask at closing:** "Do you have any other properties you're looking to offload?"`,
      },
    ],
  },
  {
    id: 'daily-sop',
    title: '📅 Daily SOP — Morning & Evening Routine',
    icon: '📅',
    sections: [
      {
        title: 'AM Tasks (Student Leads)',
        content: `**Contract Out:** Review details, authorize signatures

**Awaiting Seller Info:** Confirm seller information, name on title (LLC = member names), how to gain access (lockbox or agent/seller to open door), ensure financials are in place
- If occupied: Leases, Rent rolls, P&L 2025 to most recent quarter (multi-family), Water/trash/sewer/utilities records, Who pays each utility
- If vacant: Confirmation that utilities are on

**Terms Agreed:** Touch base on contract alignment. If stack - ensure client is on Kayla's books for stack offers for authorization. If anything outside of stack - draft the agreement manually

**Active Negotiation:** Overcome objections. Record these calls for educational purposes`,
      },
      {
        title: 'PM Tasks (Pay Per Click Leads)',
        content: `**Waiting for Signature:** Set up call to authorize

**Awaiting Seller Info:** Same as AM (collect docs)

**Terms Agreed:** Same as AM (verify stack or draft manual)

**Active Negotiation:** Same as AM (overcome objections, record)

**Offer Made:** Figure out motivation if they are a serious and qualified lead

**Offer Ready to Pitch:** Ready to Underwrite - Underwrite and navigate exit strategies for disposition then send text to client for a call to pitch

**Awaiting Photos (CRITICAL):** Stay on the phone while they take photos!
- "We strive to provide an offer the same day, and at latest just 24 hours to ensure we are making best use of your time. I will que this into our underwriting department, in order to do that - go ahead and take a photo of the kitchen and bathrooms as well as the living spaces and text them to me"
- STAY ON THE PHONE WITH THEM AS THEY DO THIS
- Generate rapport: "what they're most excited for when they sell etc."
- Email photos to yourself
- Create Google Drive, click share, "Anyone with the link"
- Title: "[the property address] Media"
- Copy/paste link into the notes section of the CRM`,
      },
      {
        title: 'FB Marketplace Prospecting (7pm-11:30pm)',
        content: `**Prime Time:** 7pm – 11:30pm daily

1. Open Facebook App → Marketplace
2. Set location: ~10 mile radius in target states
3. Search: "House for sale"

**Message rotation (to avoid spam flag):**
- "Happy Monday" / "Happy Monday!!" / "Happy happy Monday!" / "Hey happy Monday!"

**If move-in ready → F50 (50% down). If needs renovation → F10 (10% down, 24 months).**

**If interested, collect:**
- Property address
- Email address
- Phone number

Then: check rental comps on Zillow Rent Estimate Calculator → email Seth at claytoninvestmentsolutions@gmail.com subject "FB LOI Request"`,
      },
      {
        title: 'PPC Text Shortcuts',
        content: `**PIN** (Pay Per Click Intro): Send before calling so their phone recognizes your number

**PNOA** (Pay Per Click No Answer): Send if client doesn't answer twice

**PCC** (Contact Card - need photos): Send after call if they need to send photos

**PC** (Contact Card - have photos): Send after call if we have photos

**PGC** (Group Chat Intro to Closer): Send when offer is ready for closer to pitch

**PPH** (Still Need Photos): Follow-up when photos are still missing`,
      },
      {
        title: 'What NOT To Do',
        content: `**Do NOT say:**
- "Just checking in" or "Just following up" (plants seeds of uncertainty)
- "Subject to" over the phone (use proper documentation instead)
- Anything that questions the offer you already sent ("is the offer okay?", "did you get a chance to look at it?")

**DO:**
- Always use "realign" or "clarification" instead of "checking in"
- Always move the needle forward, never question what you've sent
- Send the contact card after every call
- Ask about other properties they might want to offload (double/triple/quadruple dip)
- Always send CCC after every call before hanging up
- Use voice memos when there's no answer — keeps you in the flow
- When the listing is about to expire (DOM - 181 days), circle back`,
      },
    ],
  },
  {
    id: 'abbreviations',
    title: '📖 Abbreviations & Glossary',
    icon: '📖',
    sections: [
      {
        title: 'Key Terms',
        content: `| Abbrev | Meaning |
|--------|---------|
| EMD | Earnest Money Deposit |
| COE | Close of Escrow (pay day) |
| ESC | Escrow |
| UC | Under Contract |
| ARV | After Repair Value |
| CRM | Client Relations Manager |
| DD | Due Diligence |
| LOI | Letter of Intent (non-binding deal outline) |
| PSA/P&S | Purchase and Sale Agreement |
| NOI | Net Operating Income |
| LTV | Loan-to-Value ratio |
| DSCR | Debt Service Coverage Ratio |
| SFH | Single Family Home |
| MF/MFR | Multifamily |
| BR/BA | Bedroom/Bathroom |
| SF | Square Feet |
| HOA | Homeowners Association |
| COA | Condo Association |
| FHA | Federal Housing Administration loan |
| VA | Veterans Affairs loan |
| ARM | Adjustable Rate Mortgage |
| DOM | Days on Market |
| PITI | Principal, Interest, Taxes, Insurance |
| FSBO | For Sale By Owner |
| REO | Real Estate Owned (bank-owned) |
| CMA | Comparative Market Analysis |`,
      },
    ],
  },
];

// GET /api/training — List all modules
router.get('/', (req, res) => {
  res.json({
    success: true,
    modules: TRAINING_MODULES.map(m => ({
      id: m.id,
      title: m.title,
      icon: m.icon,
      sectionCount: m.sections.length,
    })),
  });
});

// GET /api/training/:id — Get full module with sections
router.get('/:id', (req, res) => {
  const module = TRAINING_MODULES.find(m => m.id === req.params.id);
  if (!module) {
    return res.status(404).json({ error: 'Training module not found' });
  }
  res.json({ success: true, module });
});

module.exports = router;
