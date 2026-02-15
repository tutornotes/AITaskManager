const SPREADSHEET_NAME = 'AI Task Manager DB';

// Tabs
const TASKS_SHEET = 'Tasks';
const TOKENS_SHEET = 'FcmTokens';
const BILLS_SHEET = 'Bills';
const BILL_HISTORY_SHEET = 'BillHistory';
const GROCERY_ITEMS_SHEET = 'GroceryItems';
const GROCERY_SUMMARY_SHEET = 'GrocerySummary';
const GROCERY_ANALYSIS_SHEET = 'GroceryAnalysis';

// Columns
const TASK_COLUMNS = ['id','title','description','dueDate','priority','status','createdAt','updatedAt'];
const TOKEN_COLUMNS = ['fcmToken','createdAt'];
const BILL_COLUMNS = [
  'id','name','category','amount','dueDate','status',
  'lastMonthAmount','avgAmount','pctChange','spike',
  'aiInsight','updatedAt','createdAt'
];
const BILL_HISTORY_COLUMNS = ['id','billId','amount','month','createdAt'];
const GROCERY_ITEM_COLUMNS = ['id','item','essential','expectedPrice','createdAt'];
const GROCERY_SUMMARY_COLUMNS = [
  'id','totalExpected','actualTotal','difference',
  'overspendPercent','nonEssentialPercent','aiInsight','createdAt'
];
const GROCERY_ANALYSIS_COLUMNS = [
  'id','items','finalAmount','estimatedTotal','difference',
  'avoidItems','tips','summary','createdAt'
];

// Gemini (only for bills)
const GEMINI_API_KEY = 'AIzaSyDptwaOATS-Be6VdRBTtJnMbdZgQDNA8UE';
const GEMINI_MODEL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function doGet(e){ return handleRequest(e); }
function doPost(e){ return handleRequest(e); }

function handleRequest(e){
  try{
    const data=parseRequest(e);
    const action=(data.action||'').toString();

    switch(action){
      case 'list': return jsonResponse({ok:true,data:listTasks()});
      case 'addTask': return jsonResponse({ok:true,data:addTask(data)});
      case 'updateTask': return jsonResponse({ok:true,data:updateTask(data)});
      case 'toggleComplete': return jsonResponse({ok:true,data:toggleComplete(data)});
      case 'deleteTask': return jsonResponse({ok:true,data:deleteTask(data)});
      case 'registerFcmToken': registerFcmToken(data); return jsonResponse({ok:true,data:{registered:true}});

      case 'listBills': return jsonResponse({ok:true,data:listBills()});
      case 'addBill': return jsonResponse({ok:true,data:addBill(data)});
      case 'updateBill': return jsonResponse({ok:true,data:updateBill(data)});
      case 'deleteBill': return jsonResponse({ok:true,data:deleteBill(data)});
      case 'updateBillAmount': return jsonResponse({ok:true,data:updateBillAmount(data)});

      case 'addGroceryItem': return jsonResponse({ok:true,data:addGroceryItem(data)});
      case 'listGroceryItems': return jsonResponse({ok:true,data:listGroceryItems()});
      case 'deleteGroceryItem': return jsonResponse({ok:true,data:deleteGroceryItem(data)});
      case 'finalizeGrocery': return jsonResponse({ok:true,data:finalizeGrocery(data)});

      case 'saveGroceryAnalysis': return jsonResponse({ok:true,data:saveGroceryAnalysis(data)});

      default: return jsonResponse({ok:false,error:'Unknown action'});
    }
  }catch(err){
    return jsonResponse({ok:false,error:err.message||'Server error'});
  }
}

/* ===== REQUEST PARSING ===== */
function parseRequest(e){
  if(!e) return {};
  if(e.parameter && e.parameter.action) return e.parameter;
  if(e.postData && e.postData.contents){
    try{ return JSON.parse(e.postData.contents); }catch(e){}
  }
  return {};
}

/* ===== SHEET HELPERS ===== */
function getSpreadsheet(){
  const files=DriveApp.getFilesByName(SPREADSHEET_NAME);
  if(files.hasNext()) return SpreadsheetApp.open(files.next());
  return SpreadsheetApp.create(SPREADSHEET_NAME);
}
function getOrCreateSheet(ss,name,columns){
  let sh=ss.getSheetByName(name);
  if(!sh){
    sh=ss.insertSheet(name);
    sh.appendRow(columns);
  }else if(sh.getLastRow()===0){
    sh.appendRow(columns);
  }
  ensureColumns(sh,columns);
  return sh;
}
function ensureColumns(sh,columns){
  const lastCol=Math.max(sh.getLastColumn(),columns.length);
  const header=sh.getRange(1,1,1,lastCol).getValues()[0];
  let changed=false;
  columns.forEach((col,i)=>{
    if(header[i]!==col){ header[i]=col; changed=true; }
  });
  if(changed){
    sh.getRange(1,1,1,columns.length).setValues([columns]);
  }
}
function sheetToObjects(sh){
  const values=sh.getDataRange().getValues();
  if(values.length<2) return [];
  const headers=values[0];
  return values.slice(1).map(row=>{
    const obj={};
    headers.forEach((h,i)=>{ obj[h]=row[i]===''?'':row[i]; });
    return obj;
  });
}

/* ===== TASKS ===== */
function listTasks(){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TASKS_SHEET,TASK_COLUMNS);
  return sheetToObjects(sh);
}
function addTask(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TASKS_SHEET,TASK_COLUMNS);
  const now=new Date().toISOString();
  const task={
    id:Utilities.getUuid(),
    title:(data.title||'').toString(),
    description:(data.description||'').toString(),
    dueDate:(data.dueDate||'').toString(),
    priority:(data.priority||'Medium').toString(),
    status:(data.status||'Open').toString(),
    createdAt:now, updatedAt:now
  };
  sh.appendRow(TASK_COLUMNS.map(k=>task[k]||''));
  return task;
}
function updateTask(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TASKS_SHEET,TASK_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Task not found');

  const updated={
    id,
    title:(data.title||'').toString(),
    description:(data.description||'').toString(),
    dueDate:(data.dueDate||'').toString(),
    priority:(data.priority||rows[idx][4]||'Medium').toString(),
    status:(data.status||'Open').toString(),
    createdAt:rows[idx][6]||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };

  sh.getRange(idx+1,1,1,TASK_COLUMNS.length)
    .setValues([TASK_COLUMNS.map(k=>updated[k]||'')]);
  return updated;
}
function toggleComplete(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TASKS_SHEET,TASK_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Task not found');

  const completed=String(data.completed)==='true';
  rows[idx][5]=completed?'Done':'Open';
  rows[idx][7]=new Date().toISOString();
  sh.getRange(idx+1,1,1,TASK_COLUMNS.length).setValues([rows[idx]]);

  const obj={};
  TASK_COLUMNS.forEach((c,i)=>(obj[c]=rows[idx][i]));
  return obj;
}
function deleteTask(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TASKS_SHEET,TASK_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Task not found');
  sh.deleteRow(idx+1);
  return {id};
}

/* ===== FCM ===== */
function registerFcmToken(data){
  const token=(data.fcmToken||'').toString().trim();
  if(!token) return;
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,TOKENS_SHEET,TOKEN_COLUMNS);
  const values=sh.getDataRange().getValues();
  const exists=values.some((r,i)=>i>0&&r[0]===token);
  if(exists) return;
  sh.appendRow([token,new Date().toISOString()]);
}

/* ===== BILLS ===== */
function listBills(){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,BILLS_SHEET,BILL_COLUMNS);
  return sheetToObjects(sh);
}
function addBill(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,BILLS_SHEET,BILL_COLUMNS);
  const now=new Date().toISOString();
  const bill={
    id:Utilities.getUuid(),
    name:(data.name||'').toString(),
    category:(data.category||'').toString(),
    amount:Number(data.amount||0),
    dueDate:(data.dueDate||'').toString(),
    status:(data.status||'Unpaid').toString(),
    lastMonthAmount:Number(data.lastMonthAmount||0),
    avgAmount:Number(data.amount||0),
    pctChange:0, spike:false, aiInsight:'',
    updatedAt:now, createdAt:now
  };
  sh.appendRow(BILL_COLUMNS.map(k=>bill[k]||(k==='spike'?false:'')));
  return bill;
}
function updateBill(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,BILLS_SHEET,BILL_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Bill not found');

  const now=new Date().toISOString();
  rows[idx][1]=(data.name||rows[idx][1]||'').toString();
  rows[idx][2]=(data.category||rows[idx][2]||'').toString();
  rows[idx][3]=Number(data.amount||rows[idx][3]||0);
  rows[idx][4]=(data.dueDate||rows[idx][4]||'').toString();
  rows[idx][5]=(data.status||rows[idx][5]||'Unpaid').toString();
  rows[idx][6]=Number(data.lastMonthAmount||rows[idx][6]||0);
  rows[idx][11]=now;

  sh.getRange(idx+1,1,1,BILL_COLUMNS.length).setValues([rows[idx]]);
  const obj={}; BILL_COLUMNS.forEach((c,i)=>(obj[c]=rows[idx][i]));
  return obj;
}
function deleteBill(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,BILLS_SHEET,BILL_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Bill not found');
  sh.deleteRow(idx+1);
  return {id};
}
function updateBillAmount(data){
  const ss=getSpreadsheet();
  const billsSh=getOrCreateSheet(ss,BILLS_SHEET,BILL_COLUMNS);
  const historySh=getOrCreateSheet(ss,BILL_HISTORY_SHEET,BILL_HISTORY_COLUMNS);

  const rows=billsSh.getDataRange().getValues();
  const id=(data.id||'').toString();
  const newAmount=Number(data.amount||0);
  const month=(data.month||'').toString();

  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Bill not found');

  const lastAmount=Number(rows[idx][3]||0);
  const avg=computeBillAverage(historySh,id,newAmount);
  const pctChange=lastAmount?((newAmount-lastAmount)/lastAmount)*100:0;
  const spike=newAmount>avg*1.25;

  const prompt=buildBillGeminiPrompt(rows[idx][1],rows[idx][2],newAmount,lastAmount,avg,pctChange,spike);
  const insight=callGemini(prompt);

  rows[idx][3]=newAmount;
  rows[idx][6]=lastAmount;
  rows[idx][7]=avg;
  rows[idx][8]=Number(pctChange.toFixed(2));
  rows[idx][9]=spike;
  rows[idx][10]=insight;
  rows[idx][11]=new Date().toISOString();

  billsSh.getRange(idx+1,1,1,BILL_COLUMNS.length).setValues([rows[idx]]);
  historySh.appendRow([Utilities.getUuid(),id,newAmount,month||Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM'),new Date().toISOString()]);

  const obj={}; BILL_COLUMNS.forEach((c,i)=>(obj[c]=rows[idx][i]));
  return obj;
}
function computeBillAverage(sh,billId,newAmount){
  const values=sh.getDataRange().getValues();
  const amounts=values.slice(1).filter(r=>r[1]===billId).map(r=>Number(r[2]||0));
  amounts.push(newAmount);
  if(!amounts.length) return newAmount;
  const sum=amounts.reduce((a,b)=>a+b,0);
  return sum/amounts.length;
}

/* ===== GROCERY LEGACY ===== */
function addGroceryItem(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,GROCERY_ITEMS_SHEET,GROCERY_ITEM_COLUMNS);
  const now=new Date().toISOString();
  const item={
    id:Utilities.getUuid(),
    item:(data.item||'').toString(),
    essential:String(data.essential)==='true',
    expectedPrice:Number(data.expectedPrice||0),
    createdAt:now
  };
  sh.appendRow(GROCERY_ITEM_COLUMNS.map(k=>item[k]||(k==='essential'?false:'')));
  return item;
}
function listGroceryItems(){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,GROCERY_ITEMS_SHEET,GROCERY_ITEM_COLUMNS);
  return sheetToObjects(sh);
}
function deleteGroceryItem(data){
  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,GROCERY_ITEMS_SHEET,GROCERY_ITEM_COLUMNS);
  const rows=sh.getDataRange().getValues();
  const id=(data.id||'').toString();
  if(!id) throw new Error('Missing id');
  const idx=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(idx===-1) throw new Error('Item not found');
  sh.deleteRow(idx+1);
  return {id};
}
function finalizeGrocery(data){
  const ss=getSpreadsheet();
  const itemsSh=getOrCreateSheet(ss,GROCERY_ITEMS_SHEET,GROCERY_ITEM_COLUMNS);
  const summarySh=getOrCreateSheet(ss,GROCERY_SUMMARY_SHEET,GROCERY_SUMMARY_COLUMNS);

  const actualTotal=Number(data.actualTotal||0);
  const items=sheetToObjects(itemsSh);

  const totalExpected=items.reduce((sum,i)=>sum+Number(i.expectedPrice||0),0);
  const difference=actualTotal-totalExpected;
  const overspendPercent=totalExpected?(difference/totalExpected)*100:0;

  const totalNonEssential=items
    .filter(i=>String(i.essential).toLowerCase()==='false')
    .reduce((sum,i)=>sum+Number(i.expectedPrice||0),0);
  const nonEssentialPercent=totalExpected?(totalNonEssential/totalExpected)*100:0;

  const row={
    id:Utilities.getUuid(),
    totalExpected:Number(totalExpected.toFixed(2)),
    actualTotal:Number(actualTotal.toFixed(2)),
    difference:Number(difference.toFixed(2)),
    overspendPercent:Number(overspendPercent.toFixed(2)),
    nonEssentialPercent:Number(nonEssentialPercent.toFixed(2)),
    aiInsight:'',
    createdAt:new Date().toISOString()
  };

  summarySh.appendRow(GROCERY_SUMMARY_COLUMNS.map(k=>row[k]||''));
  return row;
}

/* ===== GROCERY ANALYSIS (NEW) ===== */
function saveGroceryAnalysis(data){
  data = data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if(!items.length) throw new Error('No items provided');
  if(!data.finalAmount) throw new Error('Final amount required');

  const ss=getSpreadsheet();
  const sh=getOrCreateSheet(ss,GROCERY_ANALYSIS_SHEET,GROCERY_ANALYSIS_COLUMNS);

  const row={
    id:Utilities.getUuid(),
    items:JSON.stringify(items),
    finalAmount:Number(data.finalAmount||0),
    estimatedTotal:Number(data.estimatedTotal||0),
    difference:Number(data.difference||0),
    avoidItems:JSON.stringify(data.avoidItems||[]),
    tips:JSON.stringify(data.tips||[]),
    summary:(data.summary||'').toString(),
    createdAt:new Date().toISOString()
  };

  sh.appendRow(GROCERY_ANALYSIS_COLUMNS.map(k=>row[k]!==undefined?row[k]:''));
  return row;
}

/* ===== GEMINI (Bills only) ===== */
function callGemini(prompt){
  if(!GEMINI_API_KEY || GEMINI_API_KEY==='YOUR_GEMINI_API_KEY') return '';
  const payload={
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{maxOutputTokens:180}
  };
  const res=UrlFetchApp.fetch(`${GEMINI_MODEL}?key=${GEMINI_API_KEY}`,{
    method:'post',contentType:'application/json',
    payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  const json=JSON.parse(res.getContentText()||'{}');
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()||'';
}
function buildBillGeminiPrompt(name,category,amount,lastAmount,avg,pctChange,spike){
  return [
    `Bill analysis request:`,
    `Bill: ${name}`,
    `Category: ${category}`,
    `Current amount: ${amount}`,
    `Last month: ${lastAmount}`,
    `Average: ${avg}`,
    `Percent change: ${pctChange.toFixed(2)}%`,
    `Spike detected: ${spike}`,
    `Respond in <=120 words:`,
    `1) Is this stable?`,
    `2) Trend (increasing/decreasing/flat)?`,
    `3) Any concern or suggestion?`
  ].join('\n');
}

/* ===== RESPONSE ===== */
function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}