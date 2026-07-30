const DB='mis-finanzas', VERSION=1, STORES=['funds','transactions','categories','budgets','settings'];
let promise;
export function openDB(){return promise??=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);r.onupgradeneeded=()=>{const db=r.result;STORES.forEach(s=>{if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id',autoIncrement:s==='transactions'});});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function all(store){const db=await openDB();return req(db.transaction(store).objectStore(store).getAll());}
export async function get(store,id){const db=await openDB();return req(db.transaction(store).objectStore(store).get(id));}
export async function put(store,value){const db=await openDB();return req(db.transaction(store,'readwrite').objectStore(store).put(value));}
export async function remove(store,id){const db=await openDB();return req(db.transaction(store,'readwrite').objectStore(store).delete(id));}
export async function clear(store){const db=await openDB();return req(db.transaction(store,'readwrite').objectStore(store).clear());}
function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export async function initialize(){
 if(!(await all('funds')).length)await put('funds',{id:crypto.randomUUID(),name:'Mi dinero',type:'Dinero propio',initial:0,icon:'💰',spendable:true,protected:false,created:Date.now()});
 if(!(await all('categories')).length){const expenses=['Alimentación','Transporte','Hogar','Servicios','Salud','Estudios','Compras','Entretenimiento','Préstamos','Otros'];const incomes=['Sueldo','Trabajo adicional','Venta','Devolución','Préstamo recibido','Regalo','Transferencia recibida','Otros'];for(const [type,names] of [['expense',expenses],['income',incomes]])for(const name of names)await put('categories',{id:`${type}-${name}`,type,name});}
 if(!(await get('settings','main')))await put('settings',{id:'main',monthlyLimit:1500,warning:70,critical:90,currency:'PEN',theme:'auto'});
}
export async function exportData(){const data={version:VERSION,exportedAt:new Date().toISOString()};for(const s of STORES)data[s]=await all(s);return data;}
export async function importData(data){if(!data||!Array.isArray(data.funds)||!Array.isArray(data.transactions))throw Error('Copia no válida');for(const s of STORES){await clear(s);for(const x of data[s]||[])await put(s,x);}await initialize();}
export {STORES};
