import webpush from 'web-push';
import {uid} from './security.js';
export async function notificationStatements(env,projectId,recipient,type,title,targetId=null){
  const id=uid(),now=Date.now(),subscriptions=(await env.DB.prepare('SELECT id FROM subscriptions WHERE recipient=?').bind(recipient).all()).results;
  return [env.DB.prepare('INSERT INTO notifications(id,project_id,recipient,type,title,target_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,projectId,recipient,type,title,targetId,now),...subscriptions.map(s=>env.DB.prepare('INSERT INTO push_jobs(id,notification_id,subscription_id,next_at) VALUES(?,?,?,?)').bind(uid(),id,s.id,now))];
}
export async function deliver(env,origin){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return;
  const now=Date.now(),jobs=(await env.DB.prepare("SELECT j.id,j.attempts,n.id AS notification_id,n.project_id,n.title,s.subscription FROM push_jobs j JOIN notifications n ON n.id=j.notification_id JOIN subscriptions s ON s.id=j.subscription_id JOIN projects p ON p.id=n.project_id WHERE j.state!='sent' AND j.attempts<6 AND j.next_at<=? AND j.lease_until<? AND p.status NOT IN ('archived','deleting') ORDER BY j.next_at LIMIT 12").bind(now,now).all()).results;
  for(const j of jobs){
    const claim=await env.DB.prepare("UPDATE push_jobs SET state='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND lease_until<? AND state!='sent'").bind(now+90000,j.id,now).run();if(!claim.meta.changes)continue;
    try{
      const subscription=JSON.parse(j.subscription),req=webpush.generateRequestDetails(subscription,JSON.stringify({title:'MIXROOM',body:j.title,tag:j.notification_id,url:new URL('?notification='+encodeURIComponent(j.notification_id),env.APP_URL||origin).href}),{TTL:86400,vapidDetails:{subject:origin,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
      const response=await fetch(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(response.status===404||response.status===410){await env.DB.prepare('DELETE FROM subscriptions WHERE subscription=?').bind(j.subscription).run();continue;}
      if(!response.ok)throw Error('provider rejected');
      await env.DB.prepare("UPDATE push_jobs SET state='sent',lease_until=0 WHERE id=?").bind(j.id).run();
    }catch{await env.DB.prepare("UPDATE push_jobs SET state='pending',lease_until=0,next_at=? WHERE id=?").bind(now+Math.min(3600000,60000*2**j.attempts),j.id).run();}
  }
}
