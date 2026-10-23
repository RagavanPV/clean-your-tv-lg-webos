'use strict';
var fs=require('fs'),cp=require('child_process'),policy=require('./runtime-policy');
function monotonic(){var t=process.hrtime();return t[0]*1000+t[1]/1e6;}
var root='/media/developer/apps/usr/palm/applications/com.local.nativehome';
var data=root+'/state';
var launchParams=JSON.parse(process.argv[2]||'{}'),automatic=launchParams.nativeHomeAuto===true;
function block(){fs.writeFileSync(data+'/blocked','stopped',{mode:420});}
if(automatic&&fs.existsSync(data+'/blocked'))process.exit(0);
var logPath=data+'/controller.log', pidPath=data+'/controller.pid';
fs.writeFileSync(pidPath,String(process.pid));fs.writeFileSync(logPath,'');
function log(x){fs.appendFileSync(logPath,JSON.stringify(Object.assign({time:Date.now()},x))+'\n');}
process.on('uncaughtException',function(e){try{block();}catch(ignore){}log({error:String(e)});if(child)child.stdin.end();setTimeout(function(){process.exit(2);},2500);});
var Service=require('/usr/lib/node_modules/webos-service');
var service=new Service('com.local.nativehome');
service.activityManager.create('native-home-controller',function(){});
if(!automatic){try{fs.unlinkSync(data+'/blocked');}catch(e){if(e.code!=='ENOENT')throw e;}}
var lastForeground=null,shouldResumeLaunch=require('./resume-policy');
var child,ready=false,stopping=false,lastAck=monotonic(),buffer='',lastCommand='',launching=false,resumePendingUntil=0;
log({event:'start',pid:process.pid,uid:process.getuid(),automatic:automatic});
fs.writeFileSync(data+'/control.json','{}',{mode:432});fs.chmodSync(data+'/control.json',432);
function launch(id,done){var settled=false;var deadline=setTimeout(function(){if(settled)return;settled=true;log({event:'launch-timeout',id:id});if(done)done(false);},3000);service.call('luna://com.webos.applicationManager/launch',{id:id},function(m){if(settled)return;settled=true;clearTimeout(deadline);log({event:'launch',id:id,result:m.payload});if(done)done(m.payload&&m.payload.returnValue===true);});}
function finish(code,signal){if(stopping)return;stopping=true;if(screenWatch)screenWatch.close();if(irChild)irChild.stdin.end();clearInterval(timer);log({event:'worker-exit',code:code,signal:signal});if(policy.shouldBlock(code,signal))fs.writeFileSync(data+'/blocked','stopped',{mode:420});
 function end(){try{fs.unlinkSync(pidPath);}catch(e){}process.exit(code===22?0:(code||0));}
 // Let an already-issued custom-Home request settle before the final LG launch.
 var finishDeadline=monotonic()+3200;
 function cleaned(){if(code!==22){end();return;}
  if(launching&&monotonic()<finishDeadline){setTimeout(cleaned,50);return;}
  launch('com.webos.app.home',function(){setTimeout(end,300);});
 }
 if(ready){var c=cp.spawn(root+'/relay',['cleanup'],{stdio:'ignore'});c.on('exit',function(n){log({event:'cleanup',code:n});cleaned();});}else cleaned();
}
function start(){lastAck=monotonic();child=cp.spawn(root+'/relay',[],{stdio:['pipe','pipe','pipe']});log({event:'worker-start',pid:child.pid});child.stderr.on('data',function(b){log({stderr:String(b)});});child.on('error',function(e){log({error:String(e)});finish(1);});child.on('exit',finish);
 child.stdout.on('data',function(b){buffer+=b;var i;while((i=buffer.indexOf('\n'))>=0){var line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line==='P'){lastAck=monotonic();continue;}log({event:'worker',message:line});if(line==='READY'){ready=true;lastAck=monotonic();}if(line==='HOME'&&!stopping&&!launching){launching=true;launch('com.gathin.tvhome',function(ok){launching=false;if(!ok)child.stdin.end();});}}});
 child.stdin.on('error',function(){});
}
var timer=setInterval(function(){if(stopping)return;try{var raw=fs.readFileSync(data+'/control.json','utf8');if(raw!==lastCommand){lastCommand=raw;var command=JSON.parse(raw);if(command.cmd==='startup-status')service.call('luna://com.local.nativehome.service/status',{},function(r){log({event:'startup-status',result:r.payload});});if(command.cmd==='stop'&&child)child.stdin.write('Q');if(command.cmd==='stall-worker'&&child)child.stdin.write('S');if(command.cmd==='stall-controller'){cp.spawn(root+'/resume',[String(process.pid)],{stdio:'ignore'});log({event:'simulate-controller-stall'});process.kill(process.pid,'SIGSTOP');}}}catch(e){}
 if(resumePendingUntil&&ready&&!launching){
  var resumeDue=resumePendingUntil;resumePendingUntil=0;
  if(!shouldResumeLaunch(lastForeground)){log({event:'resume-already-foreground'});}
  else if(monotonic()<=resumeDue){launching=true;log({event:'resume-launch'});launch('com.gathin.tvhome',function(ok){launching=false;if(!ok)log({event:'resume-launch-failed'});});}
 }
 if(child){if(policy.expired(lastAck,monotonic())){log({event:'worker-watchdog'});child.kill('SIGKILL');return;}child.stdin.write('P');}
},400);
// Basic IR remotes bypass relay.c; irwatch only observes them, so LG Home opens first
// and a short Home press brings the launcher back on top a moment later.
var irChild=null,irBuffer='';
function startIr(){irChild=cp.spawn(root+'/irwatch',[],{stdio:['pipe','pipe','ignore']});
 irChild.on('error',function(e){log({event:'ir-error',error:String(e)});irChild=null;});
 irChild.on('exit',function(code){log({event:'ir-exit',code:code});irChild=null;});
 irChild.stdin.on('error',function(){});
 irChild.stdout.on('data',function(b){irBuffer+=b;var i;while((i=irBuffer.indexOf('\n'))>=0){var line=irBuffer.slice(0,i);irBuffer=irBuffer.slice(i+1);log({event:'ir',message:line});
  if(line==='HOME'&&!stopping){irGuardUntil=monotonic()+3000;setTimeout(irReturn,250);}}});
}
// LG Home can finish opening just after the launcher returns and cover it, so for a
// few seconds after a short Home press, LG Home reaching the foreground means retry.
var irGuardUntil=0;
function irReturn(){if(stopping)return;if(launching){if(monotonic()<irGuardUntil)setTimeout(irReturn,300);return;}launching=true;launch('com.gathin.tvhome',function(){launching=false;});
}
setTimeout(function(){launch('com.gathin.tvhome',function(ok){if(ok){start();startIr();}else {block();process.exit(3);}});},automatic?0:1000);


process.on('exit',function(code){log({event:'controller-exit',code:code});});

service.call('luna://com.local.nativehome.service/status',{},function(m){
 log({event:'startup-status',result:m.payload});
 if(!m.payload||!m.payload.returnValue||(m.payload.state.enabled&&m.payload.state.schema===3))return;
 service.call('luna://com.local.nativehome.service/enable',{},function(a){
  if(!a.payload||!a.payload.returnValue){log({event:'startup-arm-error',result:a.payload});return;}
  service.call('luna://com.palm.activitymanager/create',{activity:{name:'com.local.nativehome.boot',description:'Bounded Native Home once per boot',type:{foreground:true,persist:true},schedule:{interval:'10s',precise:true},callback:{method:'luna://com.local.nativehome.service/tick',params:{}}},start:true,replace:true,subscribe:false},function(r){log({event:'startup-create',result:r.payload});});
 });
});

var powerPolicy=require('./power-policy')();
var watchedApps=[];try{watchedApps=JSON.parse(fs.readFileSync(data+'/apps.json','utf8'));if(!Array.isArray(watchedApps))watchedApps=[];}catch(e){}
var screenPolicy=require('./screen-policy')(watchedApps);
var screenWatch=require('./screen-watch')(data,log,function(id){
 lastForeground=id;log({event:'foreground',id:id});
 if(id==='com.webos.app.home'&&monotonic()<irGuardUntil){log({event:'ir-home-covered'});setTimeout(irReturn,250);}
 var exited=screenPolicy.next(id,monotonic());
 if(exited&&ready&&!stopping&&!launching){
  launching=true;log({event:'return-after-exit'});
  launch('com.gathin.tvhome',function(ok){launching=false;if(!ok)log({event:'return-after-exit-failed'});});
 }
},function(){lastForeground=null;screenPolicy.reset();},function(p){
 log({event:'power',state:p.state,processing:p.processing,onOff:p.onOff});
 if(p.onOff==='off'||p.state==='Active Standby'||p.state==='Suspend')resumePendingUntil=0;
 if(powerPolicy.next(p)&&!stopping)resumePendingUntil=monotonic()+10000;
});
