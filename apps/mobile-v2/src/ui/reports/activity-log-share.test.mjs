import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLogShareText } from './activity-log-share.ts';
test('rapor paylaşımı sadece gelecek planı olan kullanıcıyı ve teklif ayrıntılarını korur', () => {
 const text = activityLogShareText({range:{from:'2026-10-19T00:00:00+03:00',to:'2026-10-25T00:00:00+03:00'},nextRange:{from:'2026-10-25',to:'2026-11-01'},users:[{userId:'u',userName:'Temsilci',activityCount:0,quoteCount:0,quoteTotals:[],groups:[],week:{newOpportunities:0,stageMoves:0,won:0,lost:0,tasksCompleted:0,tasksOverdue:0,missedFollowUps:[]},targets:null,plan:[{kind:'visit',dueAt:'2026-10-26',companyName:'Planlı Firma',title:'Demo ziyareti'}]}],quotes:[{id:'q',documentNo:'TK-42',revisionNo:2,quoteDate:'2026-10-20',userName:'Temsilci',companyName:'Firma',province:null,district:null,status:'Onaylandı',statusCode:'approved',opportunityTitle:'Lazer',productName:'CNC',quantity:2,unitPrice:10,discountAmount:1,lineTotal:19,currency:'EUR'}]});
 assert.match(text,/Önümüzdeki Haftanın Planı/); assert.match(text,/Planlı Firma/); assert.match(text,/Demo ziyareti/); assert.match(text,/TK-42 R2/); assert.match(text,/Birim 10 EUR/); assert.match(text,/İskonto 1 EUR/); assert.match(text,/Onaylandı/);
});
