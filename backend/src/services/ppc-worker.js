'use strict';
const { Pool }=require('@neondatabase/serverless');
const { createService }=require('../../vendor/ppc-worker/ppc-team-note-service.cjs');
const { createWebhookInbox }=require('../../vendor/ppc-worker/ppc-sales-dialer-webhook-inbox.cjs');

const KEYS=['PPC_GHL_API_KEY','JUSTCALL_API_KEY','JUSTCALL_API_SECRET','PPC_NOTE_SERVICE_ENABLED',
  'PPC_NOTE_WORKER_ENABLED','PPC_CAMPAIGN_GUARD_ENABLED','PPC_CAMPAIGN_GUARD_MODE',
  'PPC_CAMPAIGN_GUARD_DEFER_UNTIL','RENDER_GIT_COMMIT','RENDER_INSTANCE_ID'];

function createDatabase(url){
  const pool=new Pool({connectionString:url});
  return {query:async(text,params)=>(await pool.query(text,params)).rows,end:()=>pool.end()};
}
function createPpcRuntime(source=process.env){
  const state={configured:false,started:false,error:null};
  let database,service,inbox;
  const env=Object.fromEntries(KEYS.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  env.PPC_WORKER_HOST='divinitycrm-api';
  async function start(){
    if(source.PPC_NOTE_SERVICE_ENABLED!=='true')return;
    if(!source.PPC_AUTOMATION_DATABASE_URL)throw Error('PPC_AUTOMATION_DATABASE_URL is required');
    database=createDatabase(source.PPC_AUTOMATION_DATABASE_URL);
    service=createService({db:database,env});
    inbox=createWebhookInbox(database);
    await inbox.ensureTable();
    state.configured=true;
    service.start();
    state.started=env.PPC_NOTE_WORKER_ENABLED!=='false';
  }
  async function stop(){
    if(service)await service.stop();
    if(database)await database.end();
    state.started=false;
  }
  async function health(){
    if(!state.configured)return {...state,worker_enabled:false};
    try{return {...state,...await service.health()};}
    catch(error){return {...state,error:'PPC_WORKER_HEALTH_UNAVAILABLE'};}
  }
  function getInbox(){if(!inbox)throw Error('PPC_INGRESS_NOT_CONFIGURED');return inbox;}
  return {state,start,stop,health,getInbox};
}
module.exports={createPpcRuntime};
