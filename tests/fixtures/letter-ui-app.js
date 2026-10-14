// Local UI acceptance fixture, not authentication or inference for production.
import express from 'express';
import { fileURLToPath } from 'node:url';
export function createLetterUiFixture({streamDelay=0,externalAI=false}={}){
  const app=express(),docs=new Map();let sequence=1;
  app.use(express.json());
  app.get('/api/letters/config',(_q,r)=>r.json({signedIn:true,userId:'ui-fixture',ai:true,externalAI}));
  app.get('/api/letters/documents',(_q,r)=>r.json([...docs.values()]));
  app.get('/api/letters/documents/:id',(q,r)=>docs.has(q.params.id)?r.json(docs.get(q.params.id)):r.status(404).json({error:'Not found'}));
  app.post('/api/letters/documents',(q,r)=>{const d={id:String(sequence++),kind:q.body.kind,data:q.body.data,title:q.body.data.title,revision:1};docs.set(d.id,d);r.json(d);});
  app.put('/api/letters/documents/:id',(q,r)=>{const d=docs.get(q.params.id);if(!d)return r.status(404).json({error:'Not found'});if(q.body.revision!==d.revision)return r.status(409).json({error:'Revision conflict'});Object.assign(d,{data:q.body.data,title:q.body.data.title,revision:d.revision+1});r.json(d);});
  app.get('/api/letters/search',(_q,r)=>r.json([]));
  app.post('/api/letters/ai',(q,r)=>{
    r.type('application/x-ndjson'); r.flushHeaders();
    r.write(JSON.stringify({sources:[]})+'\n');
    const tokens=streamDelay ? ['Dear Coordinator,\n\n','Thank you for your correspondence. ','We confirm receipt of the submitted documents.\n\n','Please share the remaining enclosures for review.\n\n','Yours faithfully,\nProject Team'] : ['Proposed replacement text.'];
    let index=0;
    const send=()=>{
      if(index<tokens.length) r.write(JSON.stringify({token:tokens[index++]})+'\n');
      else {clearInterval(timer); if(!q.body.prompt?.includes('[truncate]'))r.write(JSON.stringify({done:true})+'\n'); r.end();}
    };
    const timer=setInterval(send,streamDelay||1);
    r.on('close',()=>clearInterval(timer));
  });
  app.use(express.static(fileURLToPath(new URL('../../public',import.meta.url))));
  return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.env.NODE_ENV==='production')throw new Error('Never run UI fixtures in production.');
  createLetterUiFixture().listen(3014,'127.0.0.1',()=>console.log('Synthetic UI fixture at http://127.0.0.1:3014'));
}
