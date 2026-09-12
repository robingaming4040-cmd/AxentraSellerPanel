import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000); const DATA=path.join(__dirname,'data'); fs.mkdirSync(DATA,{recursive:true});
const FILE=path.join(DATA,'axentra.json'); const SESS=path.join(DATA,'sessions.json');
const now=()=>new Date().toISOString(); const rid=p=>`${p}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
const clone=x=>JSON.parse(JSON.stringify(x));
const seed={users:[],categories:[],products:[],keys:[],orders:[],finance:[],tickets:[],resellers:[],notifications:[],logs:[],campaigns:[],announcements:[],refunds:[],session:null,settings:{title:'AxentraSellerPanel',currency:'$',delivery:'Otomatik key teslimatı',store:true,register:true}};
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return clone(fallback)}}
function write(file,data){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,file)}
function hash(p,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')}
function verify(p,v){try{const [s,h]=v.split(':');const x=crypto.scryptSync(p,s,64).toString('hex');return crypto.timingSafeEqual(Buffer.from(x,'hex'),Buffer.from(h,'hex'))}catch{return false}}
let state=read(FILE,seed); let sessions=read(SESS,{});
if(!state.users.length){const password=process.env.AXENTRA_ADMIN_PASSWORD;if(!password)console.warn('AXENTRA_ADMIN_PASSWORD ayarlanmadı; kurucu hesabı için env değişkeni gerekli.');const founder={id:'U-001',username:'AxentraStore',email:'admin@axentrasellerpanel.local',password:hash(password||crypto.randomBytes(24).toString('base64url')),role:'Kurucu',balance:0,debt:0,debtLimit:0,status:'Aktif',emailVerified:true,profilePhoto:null,theme:'dark',accent:'orange',createdAt:now()};state.users=[founder];write(FILE,state)}
function save(){write(FILE,state)} function safeUser(u){return u?{...u,password:undefined}:null}
function auth(req){const t=(req.headers.authorization||'').replace(/^Bearer\s+/,'');const x=sessions[t];if(!x||x.expires<Date.now()){if(t)delete sessions[t];return null}const u=state.users.find(x=>x.id===x.userId);return u||null}
function audit(u,a,d){state.logs.unshift({date:new Date().toLocaleString('tr-TR',{hour12:false}),user:u?.username||'Sistem',action:a,detail:d});state.logs=state.logs.slice(0,500);save()}
function send(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(b)}
async function body(req){let b='';for await(const c of req)b+=c;try{return b?JSON.parse(b):{}}catch{return {}}}
function publicState(){const s=clone(state);s.users=s.users.map(safeUser);return s}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,version:'1.0.0',time:now()});
 if(req.method==='GET'&&url.pathname==='/api/public-state')return send(res,200,{ok:true,state:publicState()});
 if(req.method==='POST'&&url.pathname==='/api/auth/login'){const b=await body(req),i=String(b.identifier||'').trim().toLowerCase(),p=String(b.password||'');const u=state.users.find(x=>x.username.toLowerCase()===i||x.email.toLowerCase()===i);if(!u||u.status!=='Aktif'||!verify(p,u.password))return send(res,401,{ok:false,error:'Giriş bilgileri hatalı.'});const token=crypto.randomBytes(32).toString('hex');sessions[token]={userId:u.id,expires:Date.now()+604800000};write(SESS,sessions);audit(u,'Giriş','Web oturumu');return send(res,200,{ok:true,token,user:safeUser(u),state:publicState()})}
 if(req.method==='POST'&&url.pathname==='/api/auth/register'){const b=await body(req),username=String(b.username||'').trim(),email=String(b.email||'').trim().toLowerCase(),p=String(b.password||'');if(!/^[A-Za-z0-9_.-]{3,32}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||p.length<6)return send(res,400,{ok:false,error:'Bilgileri kontrol edin.'});if(state.users.some(x=>x.username.toLowerCase()===username.toLowerCase()||x.email.toLowerCase()===email))return send(res,409,{ok:false,error:'Kullanıcı adı veya e-posta kullanımda.'});const u={id:rid('U'),username,email,password:hash(p),role:'Normal Üye',balance:0,debt:0,debtLimit:0,status:'Aktif',emailVerified:false,profilePhoto:null,theme:'dark',accent:'orange',createdAt:now()};state.users.push(u);audit(u,'Kayıt','Yeni hesap');return send(res,201,{ok:true,user:safeUser(u)})}
 if(req.method==='POST'&&url.pathname==='/api/auth/logout'){const t=(req.headers.authorization||'').replace(/^Bearer\s+/,'');if(t){delete sessions[t];write(SESS,sessions)}return send(res,200,{ok:true})}
 if(req.method==='GET'&&url.pathname==='/api/state'){const u=auth(req);if(!u)return send(res,401,{ok:false,error:'Oturum gerekli.'});state.session=u.id;return send(res,200,{ok:true,state:publicState(),user:safeUser(u)})}
 if(req.method==='PUT'&&url.pathname==='/api/state'){const u=auth(req);if(!u)return send(res,401,{ok:false,error:'Oturum gerekli.'});const incoming=await body(req);if(!incoming||typeof incoming!=='object')return send(res,400,{ok:false,error:'Geçersiz veri.'});
   // Non-admins may only persist their own profile/session-facing fields. Admins may persist panel state.
   if(!['Kurucu','Yönetici'].includes(u.role)){
     const me=(incoming.users||[]).find(x=>x.id===u.id); const dbu=state.users.find(x=>x.id===u.id); if(me&&dbu){dbu.username=me.username||dbu.username;dbu.email=me.email||dbu.email;dbu.profilePhoto=me.profilePhoto??dbu.profilePhoto;dbu.theme=me.theme||dbu.theme;dbu.accent=me.accent||dbu.accent} state.session=u.id;
   } else {incoming.session=u.id; state={...state,...incoming,users:incoming.users||state.users};}
   save();return send(res,200,{ok:true,state:publicState()})}
 if(req.method==='GET'&&url.pathname==='/api/audit'){const u=auth(req);if(!u||!['Kurucu','Yönetici'].includes(u.role))return send(res,403,{ok:false,error:'Yetkisiz.'});return send(res,200,{ok:true,items:state.logs||[]})}
 if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(res)}
 if(req.method==='GET'){const fp=path.normalize(path.join(__dirname,'public',url.pathname));if(fp.startsWith(path.join(__dirname,'public'))&&fs.existsSync(fp)&&fs.statSync(fp).isFile()){const ext=path.extname(fp);const type=ext==='.css'?'text/css':ext==='.js'?'text/javascript':'application/octet-stream';res.writeHead(200,{'Content-Type':type});return fs.createReadStream(fp).pipe(res)}}
 return send(res,404,{ok:false,error:'Not Found'});
}catch(e){console.error(e);send(res,500,{ok:false,error:'Sunucu hatası.'})}});
server.listen(PORT,()=>console.log(`AxentraSellerPanel REAL → http://localhost:${PORT}`));
