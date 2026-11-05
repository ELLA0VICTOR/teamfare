// Conventional PowerPoint layout. All coordinates are native PowerPoint points.
// Screenshots remain photographs of the live UI; text/diagrams remain editable.
import fs from 'node:fs';
import path from 'node:path';
const W=1280,H=720,items=[];
const black='000000',white='FFFFFF',muted='454545',rule='A7A7A7',green='1F4D3A';
let current;
const add=s=>{current.shapes.push(s);return s;};
function text(x,y,w,h,value,size=23,bold=false,color=black,extra={}){return add({type:'text',x,y,w,h,text:value,size,bold,color,font:'Times New Roman',...extra});}
function rect(x,y,w,h,fill=white,line=rule,extra={}){return add({type:'rect',x,y,w,h,fill,line,...extra});}
function line(x,y,x2,y2,color=rule,width=.8,arrow=false){return add({type:'line',x,y,x2,y2,color,width,arrow});}
function picture(name,x,y,w,h,caption=null){
 const bytes=fs.readFileSync(path.resolve('submission/assets',name));const nw=bytes.readUInt32BE(16),nh=bytes.readUInt32BE(20),scale=Math.min(w/nw,h/nh);const pw=nw*scale,ph=nh*scale;
 const px=x+(w-pw)/2,py=y+(h-ph)/2;add({type:'image',image:name,x:px,y:py,w:pw,h:ph,line:rule,naturalWidth:nw,naturalHeight:nh});
 if(caption)text(x,y+h+9,w,30,caption,16,false,muted);
}
function slide(title,notes=''){
 current={title,notes,shapes:[]};items.push(current);const n=items.length;
 rect(0,0,W,H,white,null);
 if(n>1){rect(0,0,W,70,black,null);text(40,14,1200,48,title,34,true,white,{role:'title'});}
 line(40,681,1240,681,rule,.8);
 text(40,690,1090,20,'TEAMFARE  |  VULTR AGENT RUSH  |  POWERING THE FUTURE OF WORK',12,false,muted,{role:'footer'});
 text(1150,690,90,20,`${n} / 11`,12,false,black,{align:'right',role:'footer'});
}
function section(x,y,w,title,body,{bodySize=23,height=110}={}){
 text(x,y,w,33,title,25,true);text(x,y+40,w,height,body,bodySize);
}
function flow(y,labels){const gap=28,w=(1200-gap*(labels.length-1))/labels.length;labels.forEach((label,i)=>{const x=40+i*(w+gap);rect(x,y,w,38,white,black);text(x+7,y+8,w-14,24,label,17,true,black,{align:'center'});if(i<labels.length-1)line(x+w+4,y+19,x+w+gap-4,y+19,black,1.3,true);});}

slide('TEAMFARE','Introduce the project, the target users and the chosen hackathon challenge. The screenshot shows a real editable draft created from live research.');
text(40,42,1160,30,'VULTR AGENT RUSH HACKATHON',20,true);
text(40,145,460,82,'TEAMFARE',58,true,black,{role:'title'});
text(40,245,460,112,'AI-assisted planning and coordination for team outings',29,true);
text(40,377,460,115,'Research venues, agree on a time, approve a budget and keep the expense record together.',24);
text(40,520,460,64,'Challenge: Powering the Future of Work\nParticipation: Online · November 2026',20);
text(40,605,460,32,'teamfare.dixmail.xyz',22,false,'183F79',{href:'https://teamfare.dixmail.xyz'});
picture('researched-plan.png',545,120,695,485,'Figure 1. A real Plan Sheet saved from sourced research.');

slide('PROBLEM STATEMENT AND PROJECT OBJECTIVE','Explain the three operational handoffs and the objective without invented market or revenue figures.');
text(40,96,1200,64,'A team outing combines employee engagement with operational work. Decisions often move between messages, calendars and spreadsheets.',25);
section(40,190,755,'1. Planning information is scattered','Organisers compare venues, collect availability and follow up on attendance through separate conversations.',{height:90});
section(40,334,755,'2. Spending needs a clear decision','Managers need the estimated total, allowance and approval history before a team proceeds.',{height:90});
section(40,478,755,'3. Expense evidence arrives afterwards','Receipts and spending entries must be collected and consolidated into a report.',{height:90});
rect(850,190,390,420,'F3F3F3',rule);
text(877,218,337,38,'PROJECT OBJECTIVE',25,true);
text(877,282,337,270,'Provide a shared workflow that carries an outing from researched options through scheduling, manager review, attendance and expense reporting.',25);

slide('SOLUTION OVERVIEW: THE SHARED PLAN SHEET','Explain the central document and its actors. The stage line is the product journey, with cancelled outings retained separately.');
text(40,96,1200,62,'Teamfare stores the outing in one document. The organiser, manager and guests each act on the same current plan.',25);
picture('researched-plan.png',40,168,720,418);
text(40,594,720,23,'Figure 2. Live researched draft with named guests and a cost summary.',16,false,muted);
section(810,180,430,'A complete proposal','Date, place, headcount, itinerary, cost assumptions and allowance stay together.',{bodySize:23,height:85});
section(810,325,430,'Role-based actions','Organisers refine; a separate manager reviews; named guests reply and RSVP.',{bodySize:23,height:85});
section(810,470,430,'A retained record','Status changes, review notes and recorded expenses remain attached to the outing.',{bodySize:23,height:85});
flow(626,['Idea','Proposed','Approved','Happening','Settled']);

slide('AI RESEARCH: QWEN, VULTR AND TAVILY','Describe actual tool execution and distinguish research evidence from confirmed venue availability or pricing.');
text(40,96,1200,62,'The agent turns the brief into researched options. The organiser chooses which option becomes an editable plan.',25);
section(40,181,425,'Reasoning and tool calls','Qwen runs through Vultr Serverless Inference and requests bounded research actions.',{bodySize:23,height:100});
section(40,330,425,'Public-source research','Tavily searches and extracts pages. Options retain citations, estimates and questions to confirm.',{bodySize:23,height:100});
section(40,479,425,'Deterministic totals','Server code calculates costs. Fixed and per-person lines remain editable before review.',{bodySize:23,height:100});
picture('research.png',505,172,735,417,'Figure 3. Actual venue options from the deployed Qwen/Vultr/Tavily run.');
text(505,625,735,36,'Observed run, 5 Nov 2026: 2 searches · 2 pages read · 3 sourced options.',18,true);

slide('SCHEDULING AND TEAM COORDINATION','The example contains two actual replies from the shared demonstration accounts. Calendar export is not external calendar synchronisation.');
text(40,96,1200,62,'Availability is based on explicit teammate replies. Unanswered invitations remain visible instead of being treated as agreement.',25);
section(40,183,450,'Find interested teammates','Saved activity interests help organisers select the guest list.',{height:80});
section(40,326,450,'Compare proposed times','Guests mark which slots work. Ranking separates available, unavailable and unanswered guests.',{height:100});
section(40,490,450,'Coordinate after approval','Opted-in invitations and reminders support RSVP and calendar downloads.',{height:95});
picture('availability.png',545,172,695,350,'Figure 4. Two named demonstration guests have replied to the proposed times.');
text(545,565,695,89,'The organiser chooses a time and acknowledges any conflicts or missing replies. Calendar files use the saved date, start time and duration.',22);

slide('MANAGER REVIEW AND BUDGET CONTROL','The sample proposal is illustrative, not a real venue quote. The separate-manager, required-note and stale-revision checks are implemented on the server.');
text(40,96,1200,62,'A separate manager reviews the proposal before approval. The review exposes timing, headcount, estimated cost and the remaining allowance.',25);
picture('approval-panel.png',40,180,1200,218,'Figure 5. Live review panel for a sample four-person proposal.');
section(40,458,365,'Independent approval','The organiser cannot approve their own proposal. A manager records the decision.',{bodySize:23,height:125});
section(458,458,365,'Actionable feedback','Request changes with a required note. The organiser revises and resubmits.',{bodySize:23,height:125});
section(876,458,364,'Server-side checks','Over-budget approval and stale revisions are rejected. Activity records the actual actor.',{bodySize:23,height:125});

slide('EXPENSE RECORDING AND REPORTING','A receipt is private evidence attached to an expense. No payment, booking or reimbursement is initiated. Public judge outbound email is disabled.');
text(40,96,1200,62,'Recorded spending and its supporting files remain attached to the approved outing, ready for the manager’s report.',25);
section(40,184,675,'Private receipt evidence','PDF, PNG and JPEG uploads have size limits. Access is restricted to the expense creator, payer and managers.',{height:95});
section(40,334,675,'Consistent expense reporting','Filter records by outing and inclusive dates. Totals and formula-safe CSV use the same selected rows.',{height:95});
section(40,484,675,'Explicit report sharing','A private-team manager can email the filtered report to a verified teammate. Real delivery was tested separately.',{height:95});
picture('receipt-form.png',800,168,440,455,'Figure 6. Receipt upload form (sample entry, not submitted).');

slide('SYSTEM ARCHITECTURE','Preserves the approved page-8 architecture: the browser talks to the Vultr backend, which orchestrates Qwen, Tavily and Resend, persists private SQLite records, and backs up encrypted snapshots to Vultr Object Storage.');
text(40,94,1200,62,'Vultr is the operating core: Cloud Compute hosts the application and workflow engine, Serverless Inference serves Qwen, and Object Storage protects recovery.',24);
const dx=40,dy=173,k=1200/1440;
const D=(x,y,w,h)=>[dx+x*k,dy+y*k,w*k,h*k];
function wire(x,y,x2,y2,arrow=false){line(dx+x*k,dy+y*k,dx+x2*k,dy+y2*k,green,1.5,arrow);}
function node(x,y,w,h,label,title,body,{central=false,titleSize=21,bodySize=18,labelSize=12}={}){
 const [px,py,pw,ph]=D(x,y,w,h);rect(px,py,pw,ph,central?green:white,central?green:rule);
 let ty=py+15;
 if(label){text(px+16,ty,pw-32,22,label,labelSize,true,central?white:black);ty+=26;}
 text(px+16,ty,pw-32,29,title,titleSize,true,central?white:black);ty+=33;
 text(px+16,ty,pw-32,ph-(ty-py)-10,body,bodySize,false,central?white:muted,{role:'node-body'});
}
wire(300,208,400,208,true);wire(870,150,940,150);wire(940,150,940,68);wire(940,68,1015,68,true);wire(870,213,1015,213,true);wire(870,274,940,274);wire(940,274,940,350);wire(940,350,1015,350,true);wire(640,332,640,373,true);wire(870,439,1015,439,true);
text(dx+310*k,dy+181*k,89,22,'HTTPS',13,false,muted);text(dx+653*k,dy+346*k,100,22,'persist',13,false,muted);text(dx+889*k,dy+409*k,130,22,'encrypt + back up',13,false,muted);
node(0,125,300,168,'PUBLIC WEB APP','React + TypeScript','Organiser · manager · guest\nSecure cookie sessions',{titleSize:21,bodySize:17});
node(410,85,460,247,'VULTR CLOUD COMPUTE','Node.js / Fastify backend','Bounded research tool loop\nApproval and scheduling rules\nExpense ledger + receipt access\nEncrypted durable email outbox',{central:true,titleSize:22,bodySize:19});
node(1025,0,415,137,'VULTR SERVERLESS INFERENCE','Qwen reasoning + tool calls','qwen3.8-flash-next',{titleSize:21,bodySize:18});
node(1025,160,415,110,null,'Tavily','Public web search and page extraction',{titleSize:23,bodySize:17});
node(1025,294,415,110,null,'Resend','Account and opted-in workflow email',{titleSize:23,bodySize:17});
node(410,383,460,113,null,'Private SQLite / WAL','Accounts, plans, replies, expenses, receipts',{titleSize:23,bodySize:17});
node(1025,424,415,92,null,'Vultr Object Storage','Amsterdam · AES-256-GCM snapshots',{titleSize:20,bodySize:16});
text(40,626,1200,32,'Docker + Caddy on one Vultr VM · HTTPS · private persistent data · independent uptime checks · operator-led recovery',18);

slide('SECURITY AND OPERATIONAL RELIABILITY','These are implemented boundaries, not a claim that every possible vulnerability has been excluded. The research agent does not execute arbitrary model-generated code.');
text(40,96,1200,62,'The model researches options; authenticated product rules control the decisions, records and external messages.',25);
section(40,184,560,'Account and team protection','Normal accounts verify email ownership and use password-plus-code sign-in. Origin, CSRF and team-scope checks protect requests.',{bodySize:24,height:135});
section(680,184,560,'Bounded agent work','Search, source reading and option submission have time, call and usage limits. Source IDs and price claims are validated.',{bodySize:24,height:135});
section(40,420,560,'Workflow integrity','Revision checks reject stale writes. Transactions and encrypted durable email jobs support retries and duplicate protection.',{bodySize:24,height:135});
section(680,420,560,'Backup and recovery','Encrypted off-VM backups include receipt bytes. Downloads, decryption, integrity and restore checks have been exercised.',{bodySize:24,height:135});
text(40,635,1200,28,'Public judge accounts are deliberately isolated and restricted; ordinary accounts retain email verification.',18,false,muted);

slide('IMPLEMENTATION AND VALIDATION RESULTS','All numbers describe actual test runs already recorded in the repository. The read workload is a small-team measurement, not an enterprise-scale capacity test.');
text(40,96,1200,50,'Verification combines automated checks with real deployed accounts, providers, restart persistence and offsite recovery.',24);
const columns=[40,303,548,1240],top=166,headerHeight=41,rowHeight=72;
rect(40,top,1200,headerHeight,'EDEDED',black);
text(52,top+9,239,27,'AREA',21,true);text(315,top+9,221,27,'RESULT',21,true);text(560,top+9,668,27,'WHAT WAS EXERCISED',21,true);
const rows=[
 ['API and security','31 checks passed','Authentication, permissions, revisions, receipts, outbox retries, calendar/CSV serialization and backups.'],
 ['Browser workflows','17 journeys passed','12 preview journeys, 4 account/workflow journeys and 1 fixture-backed research journey.'],
 ['Real integration','4 verified users','Actual email proofs, research, scheduling, review, RSVP, private receipts and reporting.'],
 ['Read workload','160 reads; 0 failures','16 requests in flight across 4 users. Median 176 ms; p95 527 ms in one measured run.'],
 ['Restart persistence','Restart verified','Sessions, RSVP, receipt bytes and 8 reminders persisted. Cancellation stopped all 8.'],
 ['Offsite recovery','Independent restore','Encrypted objects restored on the developer’s PC; receipt hashes and original accounts matched.'],
];
rows.forEach((row,i)=>{const y=top+headerHeight+i*rowHeight;rect(40,y,1200,rowHeight,white,rule);for(let j=0;j<3;j++)text(columns[j]+12,y+11,columns[j+1]-columns[j]-24,rowHeight-19,row[j],20,j===1);});
text(40,650,1200,26,'Scope: controlled technical checks and a small-team read test; no claim of zero bugs or general capacity.',17,false,muted);

slide('CONCLUSION AND PROJECT ACCESS','Invite the judges to try both roles. Public credentials are intentional demonstration accounts, not real inboxes. The reference academic deck was used only for presentation style.');
text(40,100,1200,80,'Teamfare delivers a working research → scheduling → approval → attendance → expense-reporting workflow. Employees organise time together while managers retain a clear spending record.',25);
text(40,202,1200,65,'Vultr runs the web application, backend, model inference and encrypted backup storage. Venue bookings and payments remain external; calendar files are exports.',24);
text(40,300,150,30,'Live app:',23,true);text(205,300,1035,32,'https://teamfare.dixmail.xyz',23,false,'183F79',{href:'https://teamfare.dixmail.xyz'});
text(40,350,150,30,'Repository:',23,true);text(205,350,1035,32,'https://github.com/ELLA0VICTOR/teamfare',23,false,'183F79',{href:'https://github.com/ELLA0VICTOR/teamfare'});
text(40,407,1200,31,'PUBLIC JUDGE ACCESS — use separate browser profiles for the two roles',23,true);
const tx=[40,238,840,1240],ty=458,th=37,rh=54;
rect(40,ty,1200,th,'EDEDED',black);
['ROLE','EMAIL','PASSWORD'].forEach((v,i)=>text(tx[i]+12,ty+7,tx[i+1]-tx[i]-24,26,v,20,true));
const credentials=[['Organiser','organiser@judges.teamfare.invalid','TeamfareOrganiser2026!'],['Manager','manager@judges.teamfare.invalid','TeamfareManager2026!']];
credentials.forEach((row,i)=>{const y=ty+th+i*rh;rect(40,y,1200,rh,white,rule);row.forEach((v,j)=>text(tx[j]+12,y+14,tx[j+1]-tx[j]-24,rh-20,v,21,j===0));});
text(40,625,1200,37,'Shared demonstration team: use sample information. Normal accounts require email verification and sign-in codes.',18,false,muted);

// Prevent malformed colour parameters and preserve literal Unicode through UTF-8 JSON.
for(const s of items)for(const sh of s.shapes){if(sh.type==='text'&&typeof sh.color!=='string')sh.color=black;}
const deck={title:'Teamfare — Vultr Agent Rush',author:'Teamfare',width:W,height:H,font:'Times New Roman',slides:items};
fs.writeFileSync('submission/source/deck.json',JSON.stringify(deck,null,2));
console.log(JSON.stringify({slides:items.length,font:deck.font,canvas:[W,H],architectureSlide:8}));
