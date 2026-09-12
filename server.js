const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {URL}=require('url');
const PORT=Number(process.env.PORT)||10000;
const HOST='0.0.0.0';
const ROOT=__dirname;
const PUBLIC=path.join(ROOT,'public');
const DATA=path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true});
const STATE=path.join(DATA,'axentra.json');
const SESS=path.join(DATA,'sessions.json');
const AUDIT=path.join(DATA,'audit.json');
const read=(f,d)=>{try{return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d}catch(e){console.error('JSON:',e.message);return d}};
const write=(f,d)=>{const t=f+'.tmp';fs.writeFileSync(t,JSON.stringify(d,null,2));fs.renameSync(t,f)};
const uid=()=>crypto.randomBytes(12).toString('hex');
function hash(p,s=crypto.randomBytes(16).toString('hex')){return s+':'+crypto.scryptSync(String(p),s,64).toString('hex')}
function verify(p,v){if(!v||!v.includes(':'))return false;const [s,h]=v.split(':');const a=crypto.scryptSync(String(p),s,64).toString('hex');return a.length===h.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(h))}
let state=read(STATE,{kullanicilar:[],urunler:[],anahtarlar:[],siparisler:[],finans:[],biletler:[],bayiler:[],duyurular:[],bildirimler:[],kampanyalar:[],ayarlar:{siteAdi:'AxentraSellerPanel',currency:'USD',currencySymbol:'$'}});
let sessions=read(SESS,{}), audit=read(AUDIT,[]);
for(const k of ['kullanicilar','urunler','anahtarlar','siparisler','finans','biletler','bayiler','duyurular','bildirimler','kampanyalar'])if(!Array.isArray(state[k]))state[k]=[];
if(!state.ayarlar)state.ayarlar={siteAdi:'AxentraSellerPanel',currency:'USD',currencySymbol:'$'};
function save(){write(STATE,state)}
function pub(u){if(!u)return null;const x={...u};delete x.sifreHash;delete x.passwordHash;delete x.password;return x}
function log(action,u,extra={}){audit.push({id:uid(),tarih:new Date().toISOString(),action,kullaniciId:u?.id||null,kullanici:u?.kullaniciAdi||u?.username||null,...extra});write(AUDIT,audit.slice(-2000))}
function founder(){const name=process.env.AXENTRA_ADMIN_USERNAME||'AxentraStore', pass=process.env.AXENTRA_ADMIN_PASSWORD;if(!pass){console.warn('AXENTRA_ADMIN_PASSWORD ayarlı değil.');return}let u=state.kullanicilar.find(x=>String(x.kullaniciAdi||x.username||'').toLowerCase()===name.toLowerCase());if(!u){const h=hash(pass);u={id:uid(),kullaniciAdi:name,username:name,email:'',sifreHash:h,passwordHash:h,rol:'Kurucu',role:'Kurucu',bakiye:0,balance:0,borc:0,debt:0,borcLimiti:0,debtLimit:0,banli:false,banned:false,olusturmaTarihi:new Date().toISOString()};state.kullanicilar.push(u);save()}else{u.sifreHash=hash(pass);u.passwordHash=u.sifreHash;u.rol='Kurucu';u.role='Kurucu';save()}}
founder();
function token(req){const a=req.headers.authorization||'';return a.toLowerCase().startsWith('bearer ')?a.slice(7).trim():null}
function user(req){const t=token(req),s=t&&sessions[t];if(!s||Date.now()>s.expiresAt)return null;return state.kullanicilar.find(x=>x.id===s.userId)||null}
function admin(u){return !!u&&['Kurucu','Yönetici','Admin'].includes(u.rol||u.role)}
function body(req){return new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6)no(new Error('Body too large'))});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(new Error('Geçersiz JSON'))}});req.on('error',no)})}
function out(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS',...extra});res.end(JSON.stringify(data))}
function safeState(){return {...state,kullanicilar:state.kullanicilar.map(pub)}}
async function api(req,res,p){if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});return res.end()}
 if(p==='/api/health')return out(res,200,{ok:true,status:'online',service:'AxentraSellerPanel',time:new Date().toISOString()});
 if(p==='/api/public-state')return out(res,200,{ok:true,state:{urunler:state.urunler,kampanyalar:state.kampanyalar,duyurular:state.duyurular,ayarlar:state.ayarlar}});
 if(p==='/api/auth/login'&&req.method==='POST'){const b=await body(req),login=String(b.username??b.kullaniciAdi??b.email??'').trim(),pw=String(b.password??b.sifre??'');const u=state.kullanicilar.find(x=>String(x.kullaniciAdi||x.username||'').toLowerCase()===login.toLowerCase()||String(x.email||'').toLowerCase()===login.toLowerCase());if(!u||!verify(pw,u.sifreHash||u.passwordHash))return out(res,401,{ok:false,error:'Kullanıcı adı veya şifre hatalı.'});if(u.banli||u.banned)return out(res,403,{ok:false,error:'Hesabınız engellenmiş.'});const t=crypto.randomBytes(32).toString('hex');sessions[t]={userId:u.id,createdAt:Date.now(),expiresAt:Date.now()+7*864e5};write(SESS,sessions);log('login',u);return out(res,200,{ok:true,token:t,user:pub(u),state:safeState()})}
 if(p==='/api/auth/register'&&req.method==='POST'){const b=await body(req),name=String(b.username??b.kullaniciAdi??'').trim(),email=String(b.email??'').trim(),pw=String(b.password??b.sifre??'');if(name.length<3||pw.length<6)return out(res,400,{ok:false,error:'Kullanıcı adı en az 3, şifre en az 6 karakter olmalı.'});if(state.kullanicilar.some(x=>String(x.kullaniciAdi||x.username||'').toLowerCase()===name.toLowerCase()||(email&&String(x.email||'').toLowerCase()===email.toLowerCase())))return out(res,409,{ok:false,error:'Kullanıcı adı veya e-posta zaten kayıtlı.'});const h=hash(pw),u={id:uid(),kullaniciAdi:name,username:name,email,sifreHash:h,passwordHash:h,rol:'Normal Üye',role:'Normal Üye',bakiye:0,balance:0,borc:0,debt:0,banli:false,banned:false,olusturmaTarihi:new Date().toISOString()};state.kullanicilar.push(u);save();log('register',u);return out(res,201,{ok:true,user:pub(u)})}
 if(p==='/api/auth/logout'&&req.method==='POST'){const t=token(req),u=user(req);if(t){delete sessions[t];write(SESS,sessions)}if(u)log('logout',u);return out(res,200,{ok:true})}
 const u=user(req);if(!u)return out(res,401,{ok:false,error:'Oturum gerekli.'});
 if(p==='/api/me')return out(res,200,{ok:true,user:pub(u)});
 if(p==='/api/state'&&req.method==='GET')return out(res,200,{ok:true,state:safeState(),user:pub(u)});
 if(p==='/api/state'&&(req.method==='PUT'||req.method==='POST')){if(!admin(u))return out(res,403,{ok:false,error:'Yönetici yetkisi gerekli.'});const b=await body(req),incoming=b.state&&typeof b.state==='object'?b.state:b,old=new Map(state.kullanicilar.map(x=>[x.id,x]));for(const k of Object.keys(state)){if(k==='ayarlar'){if(incoming.ayarlar)state.ayarlar={...state.ayarlar,...incoming.ayarlar}}else if(Array.isArray(incoming[k]))state[k]=incoming[k]}if(Array.isArray(incoming.kullanicilar))state.kullanicilar=incoming.kullanicilar.map(x=>{const o=old.get(x.id),z={...x};if(o){z.sifreHash=o.sifreHash;z.passwordHash=o.passwordHash}return z});save();log('state_update',u);return out(res,200,{ok:true,state:safeState()})}
 if(p==='/api/audit')return admin(u)?out(res,200,{ok:true,audit}):out(res,403,{ok:false,error:'Yönetici yetkisi gerekli.'});
 return out(res,404,{ok:false,error:'API endpoint bulunamadı.'})}
function staticFile(req,res,p){let f=p==='/'?path.join(PUBLIC,'index.html'):path.join(PUBLIC,p);if(!fs.existsSync(f)){const root=path.join(ROOT,p);if(fs.existsSync(root)&&fs.statSync(root).isFile())f=root}if(!fs.existsSync(f)||!fs.statSync(f).isFile())return out(res,404,{ok:false,error:'Sayfa bulunamadı.'});const ext=path.extname(f).toLowerCase(),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public,max-age=3600'});fs.createReadStream(f).pipe(res)}
http.createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,`http://${req.headers.host||'localhost'}`).pathname);if(p.startsWith('/api/'))return await api(req,res,p);if(req.method!=='GET'&&req.method!=='HEAD')return out(res,405,{ok:false,error:'Method not allowed'});staticFile(req,res,p)}catch(e){console.error(e);out(res,500,{ok:false,error:'Sunucu hatası.'})}}).listen(PORT,HOST,()=>console.log(`AxentraSellerPanel REAL -> http://${HOST}:${PORT}`));
