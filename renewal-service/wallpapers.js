'use strict';
// Daily Bing wallpapers for the glass Home. Bing's image list sends no CORS
// header, so the web app cannot read it directly; this service fetches it.
var fs=require('fs');
var MAX_AGE=6*3600*1000,MARKET=/^[a-z]{2}-[A-Z]{2}$/,URLBASE=/^\/th\?id=OHR\.[A-Za-z0-9_.-]+$/;

function parse(data){
 if(!data||!Array.isArray(data.images))return [];
 return data.images.filter(function(i){return i&&typeof i.urlbase==='string'&&URLBASE.test(i.urlbase);}).map(function(i){
  return {url:'https://www.bing.com'+i.urlbase+'_1920x1080.jpg',title:String(i.title||'').slice(0,200),
   copyright:String(i.copyright||'').slice(0,300),date:String(i.startdate||'').slice(0,8)};
 });
}

function createWallpapers(options){
 var https=options.https||require('https'),dir=options.dir,file=dir+'/wallpapers.json',now=options.now||Date.now;
 function readCache(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return null;}}
 function writeCache(cache){
  try{
   if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:448});
   fs.writeFileSync(file+'.tmp',JSON.stringify(cache),{mode:384});fs.renameSync(file+'.tmp',file);
  }catch(_){}
 }
 function fetchList(market){return new Promise(function(resolve,reject){
  var finished=false,req,timer=setTimeout(function(){fail('timeout');},10000);
  function fail(code){if(finished)return;finished=true;clearTimeout(timer);if(req)req.destroy();reject(new Error(code));}
  try{
   req=https.request({hostname:'www.bing.com',port:443,method:'GET',agent:false,rejectUnauthorized:true,
    path:'/HPImageArchive.aspx?format=js&idx=0&n=8&mkt='+market,headers:{Accept:'application/json'}},function(res){
    if(res.statusCode!==200){fail('http-status');res.resume();return;}
    var chunks=[],size=0;
    res.on('data',function(chunk){if(finished)return;size+=chunk.length;if(size>65536){fail('response-too-large');return;}chunks.push(chunk);});
    res.on('error',function(){fail('network-error');});
    res.on('end',function(){
     if(finished)return;
     var images;
     try{images=parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){fail('invalid-response');return;}
     if(!images.length){fail('no-images');return;}
     finished=true;clearTimeout(timer);resolve(images);
    });
   });
   req.on('error',function(){fail('network-error');});
   req.end();
  }catch(_){fail('network-error');}
 });}
 function get(payload){
  var market=payload&&MARKET.test(payload.market)?payload.market:'en-IN',cache=readCache();
  if(cache&&cache.market===market&&now()-cache.fetchedAt<MAX_AGE&&!(payload&&payload.force))return Promise.resolve(cache);
  return fetchList(market).then(function(images){
   cache={market:market,fetchedAt:now(),images:images};writeCache(cache);return cache;
  },function(error){
   if(cache&&cache.images&&cache.images.length)return {market:cache.market,fetchedAt:cache.fetchedAt,images:cache.images,stale:true};
   throw error;
  });
 }
 return {get:get};
}

module.exports={createWallpapers:createWallpapers,parse:parse};
