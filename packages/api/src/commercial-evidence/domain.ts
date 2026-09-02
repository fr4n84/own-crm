import { buildFinancialTruthProjection, type FinancialTruthEvent } from "../profitability/financial-truth";
import type { ConfirmedFacts } from "./facts";
import { createHmac } from "node:crypto";

export const COMMERCIAL_EVIDENCE_POLICY_VERSION = "commercial-evidence-v1";
export type Acquisition = { source: string | null; campaign: string | null; ad: string | null; creative: string | null; acquisitionAngle: string | null };
export type EvidenceCase = { epochId: string; leadId: string; type?: string; assignmentAt: Date; assignmentEndedAt: Date | null; featureCutoffAt: Date; callerId: string | null; closerId: string | null; facts: ConfirmedFacts; acquisition: Acquisition; sold: boolean; soldAt?: Date | null; saleTimestamps?: readonly Date[]; financialEvents: readonly FinancialTruthEvent[] };
const DAY = 86_400_000;
const value = (fact: ConfirmedFacts["primaryProfile"]) => fact.kind === "value" ? fact.value : fact.kind === "legacy" ? `legacy:${fact.key}:${fact.value}` : "missing";

export function assertValidAsOf(asOf: Date, now = new Date()) { if (asOf > now) throw new Error("asOf cannot be in the future"); }
export function isConversionMature(item: EvidenceCase, asOf: Date) { return asOf.getTime() - item.assignmentAt.getTime() >= 30 * DAY; }
export function isMonetaryMature(item: EvidenceCase, asOf: Date) { return asOf.getTime() - item.assignmentAt.getTime() >= 90 * DAY; }
export function realizedMargin(item: EvidenceCase, currency: string) {
  return buildFinancialTruthProjection(item.financialEvents).find((row) => row.currency === currency)?.realizedMarginBeforeAdsCents ?? null;
}
function oneCasePerLead(items:readonly EvidenceCase[]){const grouped=Map.groupBy(items,item=>item.leadId);return [...grouped.values()].map(cases=>cases.find(item=>item.sold)??[...cases].sort((a,b)=>b.assignmentAt.getTime()-a.assignmentAt.getTime())[0]!).filter(Boolean);}
const median = (values: number[]) => { const sorted = [...values].sort((a,b)=>a-b); const middle=Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[middle]! : Math.round(((sorted[middle-1] ?? 0)+(sorted[middle] ?? 0))/2); };
const quantile = (values: readonly number[], percentile: number) => { if (!values.length) return null; const sorted=[...values].sort((a,b)=>a-b);const position=(sorted.length-1)*percentile;const lower=Math.floor(position),upper=Math.ceil(position);if(lower===upper)return sorted[lower]!;return Math.round(sorted[lower]!+(sorted[upper]!-sorted[lower]!)*(position-lower)); };
function wilson(successes: number, total: number) { if (!total) return [0, 1] as const; const z=1.96,p=successes/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,m=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/d; return [Math.max(0,c-m),Math.min(1,c+m)] as const; }

export function buildEconomicScore(input: { target: EvidenceCase; cohort: readonly EvidenceCase[]; asOf: Date; currency: string }) {
  assertValidAsOf(input.asOf);
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("A selected ISO currency is required");
  const matured = oneCasePerLead(input.cohort.filter((item) => item.leadId !== input.target.leadId)).filter((item) => isConversionMature(item,input.asOf));
  const p=value(input.target.facts.primaryProfile), sp=value(input.target.facts.subProfile), s=input.target.acquisition.source ?? "missing", c=input.target.acquisition.campaign ?? "missing";
  const levels = [
    { label:"profile+subprofile+source+campaign", match:(x:EvidenceCase)=>value(x.facts.primaryProfile)===p&&value(x.facts.subProfile)===sp&&(x.acquisition.source??"missing")===s&&(x.acquisition.campaign??"missing")===c },
    { label:"profile+source+campaign", match:(x:EvidenceCase)=>value(x.facts.primaryProfile)===p&&(x.acquisition.source??"missing")===s&&(x.acquisition.campaign??"missing")===c },
    { label:"profile+source", match:(x:EvidenceCase)=>value(x.facts.primaryProfile)===p&&(x.acquisition.source??"missing")===s },
    { label:"source", match:(x:EvidenceCase)=>(x.acquisition.source??"missing")===s },
    { label:"global", match:(_:EvidenceCase)=>true },
  ];
  const levelRows=levels.map((level)=>({ ...level, rows:matured.filter(level.match) }));
  let parentProbability=0.5;
  const hierarchy=[...levelRows].reverse().map((level)=>{const sales=level.rows.filter(x=>x.sold).length;const probability=(sales+parentProbability*30)/(level.rows.length+30);const result={label:level.label,sample:level.rows.length,sales,probabilityBps:Math.round(probability*10_000),parentProbabilityBps:Math.round(parentProbability*10_000)};parentProbability=probability;return result;}).reverse();
  const chosen = levelRows.find((level)=>level.rows.length>=10) ?? levelRows.at(-1)!;
  const chosenHierarchy=hierarchy.find(level=>level.label===chosen.label)!;
  const prior=chosenHierarchy.parentProbabilityBps/10_000;
  const sales=chosen.rows.filter((x)=>x.sold).length, denominator=chosen.rows.length, effectiveSample=denominator+30;
  const probability=chosenHierarchy.probabilityBps/10_000, interval=wilson(sales,denominator);
  const margins=chosen.rows.filter((x)=>x.sold&&isMonetaryMature(x,input.asOf)).map((x)=>realizedMargin(x,input.currency)).filter((x):x is number=>x!==null);
  const marginMedian=margins.length?median(margins):null;
  const expectedMarginCents=marginMedian===null?null:Math.round(probability*marginMedian);
  const marginDistribution=chosen.rows.filter(item=>isMonetaryMature(item,input.asOf)).map(item=>item.sold?realizedMargin(item,input.currency):0).filter((margin):margin is number=>margin!==null);
  const marginP10=quantile(marginDistribution,0.1),marginP90=quantile(marginDistribution,0.9);
  const score0To100=expectedMarginCents===null||marginP10===null||marginP90===null||marginP90<=marginP10?null:Math.max(0,Math.min(100,Math.round((expectedMarginCents-marginP10)/(marginP90-marginP10)*100)));
  const confidence=denominator>=30&&margins.length>=10&&interval[1]-interval[0]<=0.3&&chosen.label!=="global"?"high":denominator>=10?"medium":"low";
  return { currency:input.currency, probabilityBps:Math.round(probability*10_000), numerator:sales, denominator, priorBps:Math.round(prior*10_000), effectiveSample, fallback:chosen.label, hierarchy, wilsonBps:{low:Math.round(interval[0]*10_000),high:Math.round(interval[1]*10_000)}, realizedMarginBeforeAdsMedianCents:marginMedian, expectedMarginCents, marginScaleCents:{p10:marginP10,p90:marginP90},marginScaleSample:marginDistribution.length,score0To100, confidence, monetarySample:margins.length, policyVersion:COMMERCIAL_EVIDENCE_POLICY_VERSION, observational:true };
}

export function findTwins(input:{target:EvidenceCase;cohort:readonly EvidenceCase[];asOf:Date;currency:string;referenceSecret:string;k?:number;admin?:boolean}) {
  if(!input.referenceSecret)return {status:"reference_secret_missing" as const,items:[]};
  const features=(x:EvidenceCase)=>[value(x.facts.primaryProfile),value(x.facts.subProfile),x.acquisition.source??"missing",x.acquisition.campaign??"missing",...x.facts.motivations.map((v)=>`m:${v}`),...x.facts.objections.map((v)=>`o:${v}`)];
  const target=new Set(features(input.target));
  const items=oneCasePerLead(input.cohort.filter((x)=>x.leadId!==input.target.leadId)).filter((x)=>isConversionMature(x,input.asOf)).map((item)=>{const candidate=new Set(features(item));const matched=[...target].filter((x)=>candidate.has(x));const missing=[...target].filter((x)=>!candidate.has(x));return { item,matched,missing,weight:matched.length/(matched.length+missing.length||1)};}).sort((a,b)=>b.weight-a.weight||a.item.leadId.localeCompare(b.item.leadId)).slice(0,input.k??5).map(({item,matched,missing,weight})=>({ ...(input.admin?{leadId:item.leadId}:{}), caseRef:`case-${createHmac("sha256",input.referenceSecret).update(item.leadId).digest("hex").slice(0,20)}`,weight,matchedFactors:matched,missingFactors:missing,sold:item.sold,realizedMarginBeforeAdsCents:isMonetaryMature(item,input.asOf)?realizedMargin(item,input.currency):null }));
  return {status:"available" as const,items};
}

const MICRO_DIMENSIONS = ["type","profile","subprofile","source","campaign","acquisitionAngle","motivation","objection"] as const;
const dimensionValue=(item:EvidenceCase,key:typeof MICRO_DIMENSIONS[number])=>key==="type"?item.type??"missing":key==="profile"?value(item.facts.primaryProfile):key==="subprofile"?value(item.facts.subProfile):key==="motivation"?item.facts.motivations.join("+")||"missing":key==="objection"?item.facts.objections.join("+")||"missing":item.acquisition[key]??"missing";
export function buildMicrosegments(input:{cohort:readonly EvidenceCase[];asOf:Date;currency:string}) {
  const matured=oneCasePerLead(input.cohort).filter(x=>isConversionMature(x,input.asOf));
  const globalRate=matured.length?matured.filter(x=>x.sold).length/matured.length:0;
  const combinations: (readonly typeof MICRO_DIMENSIONS[number][])[]=[];
  for(let i=0;i<MICRO_DIMENSIONS.length;i++){combinations.push([MICRO_DIMENSIONS[i]!]);for(let j=i+1;j<MICRO_DIMENSIONS.length;j++){combinations.push([MICRO_DIMENSIONS[i]!,MICRO_DIMENSIONS[j]!]);for(let k=j+1;k<MICRO_DIMENSIONS.length;k++)combinations.push([MICRO_DIMENSIONS[i]!,MICRO_DIMENSIONS[j]!,MICRO_DIMENSIONS[k]!]);}}
  const rows=[];
  for(const dims of combinations){const groups=new Map<string,EvidenceCase[]>();for(const item of matured){const key=JSON.stringify(dims.map(d=>[d,dimensionValue(item,d)]));groups.set(key,[...(groups.get(key)??[]),item]);}for(const [segment,items] of groups){if(items.length<30)continue;const parent=dims.length===1?matured:matured.filter(x=>dims.slice(0,-1).every(d=>dimensionValue(x,d)===dimensionValue(items[0]!,d)));if(parent.length-items.length<10)continue;const sales=items.filter(x=>x.sold).length,parentRate=parent.length?parent.filter(x=>x.sold).length/parent.length:globalRate,shrunk=(sales+parentRate*30)/(items.length+30);const margins=items.filter(x=>x.sold&&isMonetaryMature(x,input.asOf)).map(x=>realizedMargin(x,input.currency)).filter((x):x is number=>x!==null);rows.push({dimensions:dims,segment:JSON.parse(segment) as [string,string][],sample:items.length,conversionBps:Math.round(shrunk*10000),liftBps:Math.round((shrunk-parentRate)*10000),expectedMarginCents:margins.length?Math.round(shrunk*median(margins)):null,label:"observational" as const,intervalBps:wilson(sales,items.length).map(x=>Math.round(x*10000))});}}
  return rows;
}

export type EvidenceSnapshot={policyVersion:string;asOf:string;target:"sale";probabilityBps:number|null;expectedMarginCents:number|null;currency:string|null;fallback:string;sample:number;confidence:string;features:Record<string,string>;status?:"economic_truth_missing"};
const SCORED_CONFIDENCE=new Set(["low","medium","high"]);
const SCORED_FALLBACKS=new Set(["profile+subprofile+source+campaign","profile+source+campaign","profile+source","source","global"]);
export function parseEvidenceSnapshot(value:unknown):EvidenceSnapshot|null{if(typeof value!=="object"||value===null||Array.isArray(value))return null;const x=value as Record<string,unknown>;const probabilityValid=x.probabilityBps===null||(typeof x.probabilityBps==="number"&&Number.isInteger(x.probabilityBps)&&x.probabilityBps>=0&&x.probabilityBps<=10000);const currencyValid=x.currency===null||(typeof x.currency==="string"&&/^[A-Z]{3}$/.test(x.currency));const marginValid=x.expectedMarginCents===null||(typeof x.expectedMarginCents==="number"&&Number.isInteger(x.expectedMarginCents));const featuresValid=typeof x.features==="object"&&x.features!==null&&!Array.isArray(x.features)&&Object.values(x.features).every(item=>typeof item==="string");const asOfValid=typeof x.asOf==="string"&&!Number.isNaN(Date.parse(x.asOf))&&new Date(x.asOf).toISOString()===x.asOf;const sampleValid=typeof x.sample==="number"&&Number.isInteger(x.sample)&&x.sample>=0;if(!(typeof x.policyVersion==="string"&&x.policyVersion.length>0&&asOfValid&&x.target==="sale"&&probabilityValid&&currencyValid&&marginValid&&sampleValid&&featuresValid))return null;const missing=x.probabilityBps===null;const missingCoherent=missing&&x.expectedMarginCents===null&&x.currency===null&&x.sample===0&&x.confidence==="insufficient"&&x.fallback==="unavailable"&&x.status==="economic_truth_missing";const scoredCoherent=!missing&&typeof x.currency==="string"&&SCORED_CONFIDENCE.has(String(x.confidence))&&SCORED_FALLBACKS.has(String(x.fallback))&&x.status===undefined;return missingCoherent||scoredCoherent?x as EvidenceSnapshot:null;}
type ScoredSnapshot={snapshot:EvidenceSnapshot;shownAt:Date;p:number;y:number};
function calibrationMetrics(rows:readonly ScoredSnapshot[]){const brier=rows.length?rows.reduce((sum,row)=>sum+(row.p-row.y)**2,0)/rows.length:null;const bins=Array.from({length:10},(_,index)=>{const selected=rows.filter(row=>row.p>=index/10&&(index===9?row.p<=1:row.p<(index+1)/10));const successes=selected.reduce((sum,row)=>sum+row.y,0);const interval=wilson(successes,selected.length);return {fromBps:index*1000,toBps:(index+1)*1000,sample:selected.length,predictedBps:selected.length?Math.round(selected.reduce((sum,row)=>sum+row.p,0)/selected.length*10000):null,actualBps:selected.length?Math.round(successes/selected.length*10000):null,actualWilsonBps:selected.length?{low:Math.round(interval[0]*10000),high:Math.round(interval[1]*10000)}:null};});const ece=rows.length?bins.reduce((sum,bin)=>sum+(bin.sample/rows.length)*Math.abs((bin.predictedBps??0)-(bin.actualBps??0))/10000,0):null;return {sample:rows.length,brier,ece,bins};}
const weekKey=(date:Date)=>{const day=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));return day.toISOString().slice(0,10);};
export function calibrateEvidenceSnapshots(input:{rows:readonly {snapshot:EvidenceSnapshot;shownAt:Date;soldAt:Date|null}[];asOf:Date}){const scored:ScoredSnapshot[]=input.rows.filter(row=>input.asOf.getTime()-row.shownAt.getTime()>=30*DAY&&row.snapshot.probabilityBps!==null).map(row=>({snapshot:row.snapshot,shownAt:row.shownAt,p:row.snapshot.probabilityBps!/10000,y:Number(Boolean(row.soldAt&&row.soldAt>row.shownAt&&row.soldAt.getTime()-row.shownAt.getTime()<=30*DAY))}));const metrics=calibrationMetrics(scored);const group=(key:(row:ScoredSnapshot)=>string)=>[...Map.groupBy(scored,key)].sort(([a],[b])=>a.localeCompare(b)).map(([name,rows])=>({key:name,...calibrationMetrics(rows)}));return {...metrics,weekly:group(row=>weekKey(row.shownAt)),byPolicy:group(row=>row.snapshot.policyVersion),byFallback:group(row=>row.snapshot.fallback)};}
