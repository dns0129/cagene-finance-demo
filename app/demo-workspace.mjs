import { createWorkspace } from './workspace-store.mjs';
import { emptyDemo } from './empty-demo.mjs';
import fixture from './demo-data.json' with {type:'json'};

const PREFIX='/api/demo/';
const SESSION_SECONDS=12*60*60;
const MAX_WORKSPACES=24;
const roles=new Set(fixture.members.map(member=>member.role));

export function createDemoWorkspaces(publicOrigin) {
  const workspaces=new Map();
  const error=(send,status,code,message)=>send(status,{error:{code,message}});

  function retire(token,entry){
    workspaces.delete(token);
    entry.retired=true;
    if(!entry.inFlight)entry.workspace.close();
  }
  function reclaim(){
    for(const [token,entry] of workspaces){
      if(entry.expiresAt<=Date.now())retire(token,entry);
    }
    if(workspaces.size>=MAX_WORKSPACES){
      const oldest=[...workspaces].find(([,entry])=>!entry.inFlight);
      if(oldest)retire(...oldest);
    }
  }
  return {
    async handle(req,res,url,send,readJSON){
      const cookieName=publicOrigin?'acct_demo':`acct_demo_${url.port||'80'}`;
      const origin=req.headers.origin, site=req.headers['sec-fetch-site'];
      if(req.headers['x-account-workspace']!=='1' ||
         !publicOrigin&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
         origin&&origin!==(publicOrigin||url.origin) || site&&!['same-origin','none'].includes(site)){
        return error(send,403,'forbidden','请通过当前站点打开演示账套。');
      }

      const token=req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1];
      const known=workspaces.get(token);
      if(known && known.expiresAt<=Date.now())retire(token,known);
      const entry=workspaces.get(token);
      const route=url.pathname.slice(PREFIX.length);
      if(route.startsWith('workspace/')){
        if(!entry){
          if(req.method==='GET'&&route==='workspace/session')return send(200,{user:null,allowSignup:false});
          return error(send,401,'demo_expired','请重新进入演示版本。');
        }
        const workspaceURL=new URL(url);
        workspaceURL.pathname='/api/'+route;
        entry.inFlight++;
        try { await entry.workspace.handle(req,res,workspaceURL,send); }
        finally {
          entry.inFlight--;
          if(entry.retired&&!entry.inFlight)entry.workspace.close();
        }
        return;
      }

      if(req.method!=='POST'||!['enter','reset','clear'].includes(route))return error(send,404,'not_found','未找到此操作。');
      if(!/^application\/json\b/i.test(req.headers['content-type']||''))
        return error(send,400,'bad_json','请求必须使用 JSON。');
      const input=await readJSON(req);
      // Another tab may have switched roles or reset while this request was reading its body.
      if(token&&entry!==workspaces.get(token))
        return error(send,409,'demo_changed','演示账套已更新，请刷新页面。');
      if(route!=='enter'&&!entry)return error(send,401,'demo_expired','请重新进入演示版本。');
      const role=input?.role ?? entry?.role ?? 'accountant';
      if(!roles.has(role))return error(send,400,'invalid_role','请选择一个演示角色。');
      const fresh=!entry||route!=='enter';
      if(!entry){
        reclaim();
        if(workspaces.size>=MAX_WORKSPACES)return error(send,429,'demo_busy','演示正在使用中，请稍后再试。');
      }
      const next=fresh ? {workspace:createWorkspace({
        publicOrigin,allowSignup:false,ownerReadOnly:true,demo:{fixture:route==='clear'?emptyDemo(fixture):fixture,cookieName},
      }),inFlight:0,retired:false} : entry;
      let session;
      try { session=next.workspace.openDemoSession(role,fresh?null:token,SESSION_SECONDS); }
      catch(err){if(fresh)next.workspace.close();throw err;}
      if(entry && fresh)retire(token,entry);
      else if(entry)workspaces.delete(token);
      Object.assign(next,{role,expiresAt:Date.now()+SESSION_SECONDS*1000});
      workspaces.set(session.secret,next);
      res.setHeader('Set-Cookie',session.cookie);
      send(200,{user:session.user});
    },
    close(){
      for(const [token,entry] of workspaces)retire(token,entry);
    },
  };
}
