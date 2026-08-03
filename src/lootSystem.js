import { ensureRpg, addOnce, dispatch, uid } from './rpgCore.js';
export const LOOT=[
{id:'iron-flask',name:'Iron Flask',icon:'🥤',rarity:'Common',description:'A battered vessel from the First Forge.'},
{id:'emberstone',name:'Emberstone',icon:'🔥',rarity:'Uncommon',description:'Warm to the touch after a day well fought.'},
{id:'pathfinder-compass',name:'Pathfinder Compass',icon:'🧭',rarity:'Rare',description:'Points toward the next honest mile.'},
{id:'ashen-cloak',name:'Ashen Cloak',icon:'🧥',rarity:'Epic',description:'A cosmetic mantle earned beyond the easy road.'},
{id:'gauntlets-first-forge',name:'Gauntlets of the First Forge',icon:'🧤',rarity:'Epic',description:'Proof of stubborn work in the forge.'},
{id:'relic-long-road',name:'Relic of the Long Road',icon:'🔱',rarity:'Legendary',description:'A rare relic for campaigns that refuse to stop.'}
];
export function grantLoot(data,{lootId,source,at=new Date().toISOString(),eventId}={}){ const r=ensureRpg(data); r.inventory ||= []; r.loot ||= {events:[]}; r.loot.events ||= []; if(eventId&&r.loot.events.some(e=>e.id===eventId)) return null; const item=LOOT.find(x=>x.id===lootId)||LOOT[0]; const earned={...item,earnedAt:at,source:source||'Campaign',eventId:eventId||uid('loot',item.id,at)}; if(!addOnce(r.inventory,earned,'id')) return null; r.loot.events.push({id:earned.eventId,itemId:item.id,at,source:earned.source}); dispatch('loot-earned',earned); return earned; }
