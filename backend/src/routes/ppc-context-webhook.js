'use strict';
const crypto=require('node:crypto');
const express=require('express');
const { LOCATION_ID,NOTE_WORKFLOW_ID,normalizeEvent }=require('../../vendor/ppc-worker/ppc-sales-dialer-webhook-inbox.cjs');

function authorized(header,secret){
  if(!secret||typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const supplied=Buffer.from(header.slice(7));const expected=Buffer.from(secret);
  return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
}
function createPpcContextWebhook({runtime,secret,maxBytes=65536}){
  const router=express.Router();
  router.post('/',async(req,res)=>{
    if(!authorized(req.get('authorization'),secret))return res.status(401).json({received:false});
    const payload=req.body||{};
    if(Buffer.byteLength(JSON.stringify(payload))>maxBytes)return res.status(413).json({received:false});
    const location=payload.locationId||payload.location_id||payload.location?.id;
    if(location!==LOCATION_ID||payload.workflow?.id!==NOTE_WORKFLOW_ID)
      return res.status(403).json({received:false});
    if(!normalizeEvent(payload))return res.status(400).json({received:false});
    try{
      const result=await runtime.getInbox().enqueue(payload);
      return res.status(200).json({received:true,result:result.result});
    }catch(error){return res.status(503).json({received:false,retryable:true});}
  });
  return router;
}
module.exports={createPpcContextWebhook,authorized};
