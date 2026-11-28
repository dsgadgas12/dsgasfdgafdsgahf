import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Bomb, Check, ChevronRight, CircleHelp,
  Coins, Crown, Gamepad2, Gift, Grid3X3, LockKeyhole, Minus, Plus,
  Search, Settings, Shield, ShoppingBag, Sparkles, Star, Trophy, UserCircle,
  Wallet, X, Zap, Snowflake, Flame, Sun, Cloud, Copy, Package, RotateCcw,
  TrendingUp, Headphones, BookOpen, Globe, Ticket, Clock3, Plane,
  CheckCircle2, XCircle, CalendarDays, ArrowDownToLine, CircleDollarSign, Mail, Bot, ArrowUpRight, ArrowDownUp, ChevronDown
} from "lucide-react";
import giftsRaw from "./data/gifts.json";
import casesRaw from "./data/cases.json";
import { api, setAuthToken } from "./api";
import TgsSticker from "./components/TgsSticker";

type GiftItem = {
  id: string; name: string; price_stars: number; price_usd: number;
  image: string | null; rarity: string; source_archive: string; image_status: string;
};
type CasePrize = { gift_id: string; weight_bp: number };
type CaseItem = {
  id: string; name: string; price_stars: number; category: "stars"|"nft";
  theme: string; description: string; banner?: string; items: CasePrize[];
};
type WithdrawalRequest = {
  id:number; asset_type:"stars"|"gift"; amount:number|null; gift_id:string|null;
  gift_name?:string; gift_count?:number; status:string; submitted_at:string; destination:string;
};
type CrashPlayer = {
  tg_id:number; amount:number; status:"pending"|"cashed"|"lost";
  cashout_multiplier:number|null; payout:number; display_name:string; photo_url:string|null;
};
type CrashState = {
  round_id:number; phase:"betting"|"running"|"crashed"; countdown:number;
  betting_elapsed:number; crash_elapsed:number;
  multiplier:number; crash_at:number|null; balance:number;
  my_bet:any|null; players:CrashPlayer[];
};
type OwnedGift = { uid: string; giftId: string; acquiredAt: number };
type Page = "games"|"leaders"|"shop"|"profile"|"cases"|"case-detail"|"free-case"|"upgrade"|"slots"|"crash"|"mines"|"admin";

const gifts = giftsRaw as GiftItem[];
const cases = casesRaw as CaseItem[];
const freeCaseGifts = gifts
  .filter(g => g.price_stars >= 800 && g.image_status !== "star")
  .sort((a,b) => b.price_stars-a.price_stars);
const freeCaseStarAmounts = [2,5,10,25,50,100,250,500,700];
const freeCase: CaseItem = {
  id: "free-case",
  name: "Бесплатный кейс",
  price_stars: 0,
  category: "nft",
  theme: "mythic",
  description: "Бесплатное открытие",
  banner: "assets/banners/free-case.png",
  items: [
    ...freeCaseStarAmounts.map(amount => ({gift_id:`stars-${amount}`,weight_bp:0})),
    ...freeCaseGifts.map(g => ({gift_id:g.id,weight_bp:0}))
  ]
};
const byId = new Map<string,GiftItem>(gifts.map(g => [g.id, g] as const));
const fmt = (n:number) => Math.round(n).toLocaleString("ru-RU");
const imageSrc = (g:GiftItem) => g.image ? `/${g.image}` : "";
const rarityClass = (r:string) => ({
  "Обычный":"common","Необычный":"uncommon","Редкий":"rare",
  "Эпический":"epic","Легендарный":"legendary","Мифический":"mythic"
}[r] || "common");
const readStored = <T,>(key:string, fallback:T):T => {
  try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
};
const pickPrize = (c:CaseItem):CasePrize => {
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  let acc=0;
  for (const item of c.items) { acc += item.weight_bp; if (roll < acc) return item; }
  return c.items[c.items.length-1];
};
const pickDemoCasePrize = (c:CaseItem):CasePrize => {
  const key=`cloudegift_demo_case_opens_${c.id}`;
  const openingNumber=readStored<number>(key,0)+1;
  try { localStorage.setItem(key,JSON.stringify(openingNumber)); } catch {}
  const premium=c.items.filter(item=>!isStarPrize(item)&&(byId.get(item.gift_id)?.price_stars||0)>=c.price_stars);
  const common=c.items.filter(item=>isStarPrize(item)?["stars-100","stars-300"].includes(item.gift_id):(byId.get(item.gift_id)?.price_stars||0)<c.price_stars);
  const pool=openingNumber%20===0?premium:common;
  const safePool=pool.length?pool:c.items;
  const total=safePool.reduce((sum,item)=>sum+Math.max(0,item.weight_bp),0);
  let roll=crypto.getRandomValues(new Uint32Array(1))[0]%Math.max(1,total);
  for(const item of safePool){roll-=Math.max(0,item.weight_bp);if(roll<0)return item;}
  return safePool[safePool.length-1];
};
const isStarPrize=(p:CasePrize)=>p.gift_id.startsWith("stars-");
const starPrizeAmount=(p:CasePrize)=>isStarPrize(p)?Number(p.gift_id.split("-")[1]):0;
const starTier=(n:number)=>n<=80?"star-grey":n<=300?"star-blue":n<=999?"star-pink":"star-red";
const prizeName=(p:CasePrize)=>isStarPrize(p)?`${fmt(starPrizeAmount(p))} ⭐`:byId.get(p.gift_id)?.name||"Подарок";
const prettyDate=(value:string)=>new Date(value).toLocaleString("ru-RU",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const formatCompactCountdown=(milliseconds:number)=>{
  const ms=Math.max(0,Math.floor(milliseconds));
  const hours=Math.floor(ms/3600000);
  const minutes=Math.floor((ms%3600000)/60000);
  const seconds=Math.floor((ms%60000)/1000);
  const millis=ms%1000;
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(millis).padStart(3,"0")}`;
};
const tap = () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
const tgUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user;
const openTelegramUrl=(url:string)=>{
  const webApp=window.Telegram?.WebApp;
  if(webApp?.openTelegramLink)webApp.openTelegramLink(url);
  else window.open(url,"_blank","noopener,noreferrer");
};
const openExternalUrl=(url:string)=>{
  const webApp=window.Telegram?.WebApp;
  if(webApp?.openLink)webApp.openLink(url);
  else window.open(url,"_blank","noopener,noreferrer");
};
const makeDepositMemo=()=>{
  const bytes=crypto.getRandomValues(new Uint32Array(2));
  return `CG-${bytes[0].toString(36).toUpperCase()}-${bytes[1].toString(36).toUpperCase()}`;
};
function CurrencyIcon({kind="stars",className=""}:{kind?:"stars"|"gram";className?:string}) {
  return <img className={`currency-icon ${className}`} src={kind==="stars"?"/assets/payment/star.png":"/assets/payment/gram.png"} alt={kind==="stars"?"Telegram Stars":"GRAM"}/>;
}

function GiftImage({gift, className=""}:{gift:GiftItem;className?:string}) {
  return gift.image
    ? <img className={`gift-image ${className}`} src={imageSrc(gift)} alt={gift.name} loading="lazy" />
    : <div className={`gift-placeholder ${className}`}><Package size={28}/><small>Нет модели</small></div>;
}
function PrizeVisual({prize,className=""}:{prize:CasePrize;className?:string}) {
  if(isStarPrize(prize)) {
    const amount=starPrizeAmount(prize);
    return <div className={`star-prize-visual ${starTier(amount)} ${className}`}><CurrencyIcon/><b>{fmt(amount)}</b></div>;
  }
  const gift=byId.get(prize.gift_id);
  return gift?<GiftImage gift={gift} className={className}/>:<div className="gift-placeholder">?</div>;
}
function ConfettiBurst() {
  return <div className="confetti-burst" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${(i%6)*.08}s`}}/>)}</div>;
}
function StarPrice({value}:{value:number}) {
  return <span className="star-price"><CurrencyIcon/>{fmt(value)}</span>;
}
function CaseRoulette({c,selected,fast,onComplete}:{c:CaseItem;selected:CasePrize[];fast:boolean;onComplete:()=>void}) {
  const stopIndex=35;
  const tileWidth=54;
  const tileGap=8;
  const stride=tileWidth+tileGap;
  const prizeKey=selected.map(prize=>prize.gift_id).join("|");
  const tracks=useMemo(()=>selected.map((prize)=>{
    const source=c.items.length?c.items:[prize];
    const items=Array.from({length:48},()=>source[Math.floor(Math.random()*source.length)]);
    items[stopIndex]=prize;
    return items;
  }),[c.id,prizeKey]);
  const viewportRef=useRef<HTMLDivElement>(null);
  const completedLanes=useRef<Set<number>>(new Set());
  const onCompleteRef=useRef(onComplete);
  const [padding,setPadding]=useState(0);
  const [stopped,setStopped]=useState(false);
  useEffect(()=>{onCompleteRef.current=onComplete;},[onComplete]);
  useEffect(()=>{
    const update=()=>{
      const width=viewportRef.current?.clientWidth||Math.min(window.innerWidth,600);
      setPadding(Math.max(0,(width-tileWidth)/2));
    };
    update();
    const observer=typeof ResizeObserver!=="undefined"&&viewportRef.current?new ResizeObserver(update):null;
    if(observer&&viewportRef.current)observer.observe(viewportRef.current);
    window.addEventListener("resize",update);
    return()=>{observer?.disconnect();window.removeEventListener("resize",update);};
  },[]);
  useEffect(()=>{
    if(!stopped)return;
    const timer=window.setTimeout(()=>onCompleteRef.current(),650);
    return()=>window.clearTimeout(timer);
  },[stopped]);
  const laneComplete=(lane:number)=>{
    if(completedLanes.current.has(lane))return;
    completedLanes.current.add(lane);
    if(completedLanes.current.size===tracks.length)setStopped(true);
  };
  return <div className="case-roulette-multi" ref={viewportRef}>
    <div className="case-roulette-lanes">
      {tracks.map((track,lane)=> <div className="case-roulette-lane" key={`lane-${lane}`}>
        <div className="case-wheel-window case-wheel-window-opening case-roulette-window">
          <motion.div className="case-wheel-track case-wheel-track-opening case-roulette-track"
            style={{paddingLeft:padding}}
            initial={{x:0}}
            animate={{x:-(stopIndex*stride)}}
            transition={{duration:fast?1.15:6.2,ease:[0.08,0.72,0.12,1]}}
            onAnimationComplete={()=>laneComplete(lane)}>
            {track.map((prize,index)=><div
              className={`case-wheel-item case-roulette-item${stopped&&index===stopIndex?" is-winner":""}`}
              key={`${lane}-${prize.gift_id}-${index}`}>
              <PrizeVisual prize={prize}/>
            </div>)}
          </motion.div>
        </div>
      </div>)}
    </div>
  </div>;
}
function CaseMultiPreview({c,count}:{c:CaseItem;count:number}) {
  const rows=useMemo(()=>Array.from({length:count},()=>{
    const source=c.items.length?c.items:[{gift_id:"stars-2",weight_bp:10000}];
    const shuffled=[...source].sort(()=>Math.random()-.5);
    return Array.from({length:Math.max(14,shuffled.length)},(_,i)=>shuffled[i%shuffled.length]);
  }),[c.id,count]);
  return <div className={`case-idle-preview ${count===1?"is-single":"is-multi"}`}>
    {rows.map((row,lane)=><div className="case-multi-preview-row case-idle-window" key={`${c.id}-${count}-${lane}`}>
      <div className="case-idle-track" style={{animationDuration:`${row.length*(count===1?2.5:1.8)}s`,animationDelay:`-${lane*3}s`}}>
        {[0,1].map(copy=><div className="case-idle-group" key={copy} aria-hidden={copy===1?true:undefined}>{row.map((prize,i)=><div className="case-idle-cell" key={`${i}-${prize.gift_id}`}>
          <PrizeVisual prize={prize}/>{count===1&&<><b>{prizeName(prize)}</b><StarPrice value={isStarPrize(prize)?starPrizeAmount(prize):byId.get(prize.gift_id)?.price_stars||0}/></>}
        </div>)}</div>)}
      </div>
    </div>)}
  </div>;
}

function Button({children,onClick,kind="primary",disabled=false}:{children:React.ReactNode;onClick:()=>void;kind?:"primary"|"white"|"ghost"|"danger";disabled?:boolean}) {
  return <motion.button className={`btn btn-${kind}`} whileTap={disabled?undefined:{scale:.97}} transition={{type:"spring",stiffness:380,damping:28}} onClick={onClick} disabled={disabled}>{children}</motion.button>;
}
function Modal({children,onClose,title="CloudeGift"}:{children:React.ReactNode;onClose:()=>void;title?:string}) {
  const reduced=useReducedMotion();
  const cardRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    cardRef.current?.focus();
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeRef.current();}
      if(event.key!=="Tab")return;
      const elements=Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements[elements.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===cardRef.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===cardRef.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",handleKey);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",handleKey);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.28}} onClick={onClose}>
    <motion.div ref={cardRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="modal-card" initial={{opacity:0,y:reduced?0:48,scale:reduced?1:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:30,scale:reduced?1:.985}} transition={{type:"spring",stiffness:300,damping:32,mass:1}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" aria-label="Закрыть" onClick={onClose}><X size={19}/></button>
      {children}
    </motion.div>
  </motion.div>;
}

export default function App() {
  const [introVisible,setIntroVisible]=useState(()=>{try{return !sessionStorage.getItem("cg_intro_seen");}catch{return true;}});
  const [page,setPage]=useState<Page>("games");
  const [pageHistory,setPageHistory]=useState<Page[]>([]);
  const [activeCase,setActiveCase]=useState<CaseItem|null>(null);
  const [modalGift,setModalGift]=useState<GiftItem|null>(null);
  const [modalInventoryUid,setModalInventoryUid]=useState("");
  const [upgradeInitialUid,setUpgradeInitialUid]=useState("");
  const [resultGift,setResultGift]=useState<GiftItem|null>(null);
  const [lastWonInventoryUid,setLastWonInventoryUid]=useState("");
  const [resultStars,setResultStars]=useState<number|null>(null);
  const [roulettePrizes,setRoulettePrizes]=useState<CasePrize[]|null>(null);
  const [batchResults,setBatchResults]=useState<CasePrize[]|null>(null);
  const [caseOpenCount,setCaseOpenCount]=useState(1);
  const [caseFastMode,setCaseFastMode]=useState(false);
  const [rouletteFastMode,setRouletteFastMode]=useState(false);
  const [opening,setOpening]=useState(false);
  const [upgradeBusy,setUpgradeBusy]=useState(false);
  const reducedMotion=useReducedMotion();
  const [toast,setToast]=useState("");
  const [balance,setBalance]=useState<number>(()=>{
    const demoBalance=Number(import.meta.env.VITE_DEMO_BALANCE||0);
    return demoBalance>0?demoBalance:Number(localStorage.getItem("cg_balance")||2500);
  });
  const [inventory,setInventory]=useState<OwnedGift[]>(()=>readStored("cg_inventory",[]));
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState<"asc"|"desc">("asc");
  const [rarityFilter,setRarityFilter]=useState("Все");
  const [promo,setPromo]=useState("");
  const [topupOpen,setTopupOpen]=useState(false);
  const [topupMethod,setTopupMethod]=useState<"gram"|"stars"|"gift">("gram");
  const [topupAmount,setTopupAmount]=useState("1000");
  const [gramAmount,setGramAmount]=useState("10");
  const [gramMemo]=useState(makeDepositMemo);
  const gramWallet=import.meta.env.VITE_GRAM_WALLET_ADDRESS || "";
  const [withdrawOpen,setWithdrawOpen]=useState(false);
  const [withdrawType,setWithdrawType]=useState<"stars"|"gift">("stars");
  const [withdrawAmount,setWithdrawAmount]=useState("1500");
  const [withdrawDestination,setWithdrawDestination]=useState("");
  const [withdrawInventoryUids,setWithdrawInventoryUids]=useState<string[]>([]);
  const [withdrawals,setWithdrawals]=useState<WithdrawalRequest[]>([]);
  const [liveDrops,setLiveDrops]=useState<any[]>([]);
  const [token,setToken]=useState("");
  const [profile,setProfile]=useState<any>(null);
  const [isAdmin,setIsAdmin]=useState(import.meta.env.VITE_DEMO_ADMIN==="true");
  const [shopCategory,setShopCategory]=useState("Все");
  const [freeCaseInfo,setFreeCaseInfo]=useState<any>(null);
  const [freeCaseRemainingMs,setFreeCaseRemainingMs]=useState(0);
  const [freeCaseModalOpen,setFreeCaseModalOpen]=useState(false);
  const [freeCaseTaskCheck,setFreeCaseTaskCheck]=useState<{share:boolean;channel:boolean}|null>(null);
  const [freeCaseChecking,setFreeCaseChecking]=useState(false);
  const [sharePrepared,setSharePrepared]=useState<{message_id:string;share_token:string}|null>(null);
  const [sharePreparing,setSharePreparing]=useState(false);
  const [shareSending,setShareSending]=useState(false);

  const tg = window.Telegram?.WebApp;
  const user = tgUser();
  const displayName = profile?.first_name || [user?.first_name,user?.last_name].filter(Boolean).join(" ") || "Гость";
  const username = profile?.username || user?.username || "";
  const userId = profile?.tg_id || user?.id || "DEMO";
  const photoUrl = profile?.photo_url || user?.photo_url || "";
  const adminIds = (import.meta.env.VITE_ADMIN_IDS || "").split(",").map(x=>x.trim()).filter(Boolean);
  const adminAllowed = isAdmin || (!!user?.id && adminIds.includes(String(user.id)));

  useEffect(()=>{
    tg?.ready(); tg?.expand();
    const apiUrl=import.meta.env.VITE_API_URL;
    if (tg?.initData || (apiUrl && import.meta.env.DEV)) {
      const devUser=new URLSearchParams(window.location.search).get("dev_user");
      const startParam=tg?.initDataUnsafe?.start_param || (devUser&&/^\d+$/.test(devUser)?`dev_${devUser}`:"");
      api("/api/auth/telegram",{init_data:tg?.initData || "",start_param:startParam}).then(async (res:any)=>{
        setToken(res.access_token); setAuthToken(res.access_token); setProfile(res.user);
        setIsAdmin(!!res.user?.is_admin);
        setBalance(res.user?.balance ?? 0);
        const me:any=await api("/api/me");
        setInventory((me.inventory || []).map((x:any)=>({uid:String(x.inventory_id),giftId:x.gift_id,acquiredAt:Date.parse(x.acquired_at)})));
      }).catch(()=>{});
    }
  },[]);
  useEffect(()=>{
    if(!token)return;
    let alive=true;
    const refresh=async()=>{
      try {
        const [requests,events,me]=await Promise.all([
          api<WithdrawalRequest[]>("/api/withdrawals"),
          api<any[]>("/api/live"),
          api<any>("/api/me")
        ]);
        if(alive){
          setWithdrawals(requests);setLiveDrops(events);
          setInventory((me.inventory||[]).map((x:any)=>({uid:String(x.inventory_id),giftId:x.gift_id,acquiredAt:Date.parse(x.acquired_at)})));
        }
      } catch {}
    };
    refresh();
    const id=window.setInterval(refresh,5000);
    return()=>{alive=false;window.clearInterval(id);};
  },[token]);
  useEffect(()=>{
    if(!token)return;
    refreshFreeCaseInfo().catch(()=>{});
  },[token]);
  useEffect(()=>{
    const next=freeCaseInfo?.next_open_at;
    if(!next){setFreeCaseRemainingMs(0);return;}
    const update=()=>setFreeCaseRemainingMs(Math.max(0,Date.parse(next)-Date.now()));
    update();
    const id=window.setInterval(update,50);
    return()=>window.clearInterval(id);
  },[freeCaseInfo?.next_open_at]);
  useEffect(()=>{
    if(!freeCaseModalOpen || !token || sharePrepared || freeCaseInfo?.share_complete)return;
    let cancelled=false;
    setSharePreparing(true);
    api<any>("/api/free-case/share/prepare",{}).then(result=>{
      if(!cancelled)setSharePrepared({message_id:result.message_id,share_token:result.share_token});
    }).catch((error:any)=>{
      if(!cancelled)notify("Не удалось подготовить сообщение: "+error.message);
    }).finally(()=>setSharePreparing(false));
    return()=>{cancelled=true;};
  },[freeCaseModalOpen,token,sharePrepared,freeCaseInfo?.share_complete]);
  useEffect(()=>{
    if(token || !import.meta.env.DEV)return;
    const makeDrop=()=>{
      const roll=Math.random();
      if(roll<0.2){
        const amounts=[10,25,50,80,100,250,500,1000];
        const amount=amounts[Math.floor(Math.random()*amounts.length)];
        return {id:`demo-${Date.now()}-${Math.random()}`,type:"case_open",gift_name:null,gift_price:null,star_reward:amount,demo:true};
      }
      const pool=roll<0.66?gifts.filter(g=>g.price_stars<2500):roll<0.88?gifts.filter(g=>g.price_stars>=2500&&g.price_stars<9000):gifts.filter(g=>g.price_stars>=9000);
      const gift=pool[Math.floor(Math.random()*pool.length)]||gifts[Math.floor(Math.random()*gifts.length)];
      return {id:`demo-${Date.now()}-${Math.random()}`,type:"case_open",gift_name:gift.name,gift_price:gift.price_stars,gift_image:gift.image,star_reward:null,demo:true};
    };
    setLiveDrops(Array.from({length:8},makeDrop));
    const timer=window.setInterval(()=>setLiveDrops(old=>[makeDrop(),...old].slice(0,12)),2600);
    return()=>window.clearInterval(timer);
  },[token]);
  useEffect(()=>{localStorage.setItem("cg_balance",String(balance));},[balance]);
  useEffect(()=>{localStorage.setItem("cg_inventory",JSON.stringify(inventory));},[inventory]);
  useEffect(()=>{
    if(!toast) return;
    const t=window.setTimeout(()=>setToast(""),2600);
    return ()=>window.clearTimeout(t);
  },[toast]);

  const notify=(text:string)=>setToast(text);
  async function refreshFreeCaseInfo(){
    if(!token)return null;
    const info:any=await api("/api/free-case");
    setFreeCaseInfo(info);
    return info;
  }
  const refreshAccount=async()=>{
    if(!token)return;
    const me:any=await api("/api/me");
    setBalance(me.user.balance);
    setInventory((me.inventory||[]).map((x:any)=>({uid:String(x.inventory_id),giftId:x.gift_id,acquiredAt:Date.parse(x.acquired_at)})));
  };
  const showTopup=()=>{setTopupMethod("stars");setTopupOpen(true);};
  const showGiftTopup=()=>{setTopupMethod("gift");setTopupOpen(true);};
  const copyText=async(value:string,label:string)=>{
    try{await navigator.clipboard.writeText(value);notify(`${label} скопирован`);}
    catch{notify("Не удалось скопировать. Выдели текст вручную.");}
  };
  const openGramTopup=async()=>{
    if(!gramWallet){notify("Пополнение GRAM пока недоступно");return;}
    try{await navigator.clipboard.writeText(gramMemo);}catch{}
    setTopupOpen(false);
    openExternalUrl(`https://app.tonkeeper.com/transfer/${encodeURIComponent(gramWallet)}?text=${encodeURIComponent(`${gramMemo} · ${gramAmount} GRAM`)}`);
    notify(`Адрес и memo подготовлены. В Tonkeeper выбери GRAM и введи ${fmt(Number(gramAmount)||0)} GRAM перед подтверждением.`);
  };
  const addOwned=(giftId:string,uid?:string)=>{
    const newUid=uid || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    setInventory(old=>[...old,{uid:newUid,giftId,acquiredAt:Date.now()}]);
    return newUid;
  };
  const removeOwned=(uid:string)=>setInventory(old=>old.filter(x=>x.uid!==uid));
  const ownedGift=(item:OwnedGift)=>byId.get(item.giftId);
  const ownedValue=inventory.reduce((sum,x)=>sum+(byId.get(x.giftId)?.price_stars||0),0);

  const go=(p:Page)=>{
    if(opening||upgradeBusy){notify("Дождитесь результата");return;}
    tap();
    if(p!==page)setPageHistory(old=>[...old,page]);
    window.scrollTo({top:0,behavior:"instant"});
    setPage(p);
    if(p!=="case-detail")setActiveCase(null);
  };
  const goRoot=(p:Page)=>{if(opening||upgradeBusy){notify("Дождитесь результата");return;}tap();setPageHistory([]);setPage(p);setActiveCase(null);window.scrollTo({top:0,behavior:"instant"});};
  const goBack=()=>{
    if(opening||upgradeBusy){notify("Дождитесь результата");return;}
    tap();
    const previous=pageHistory[pageHistory.length-1];
    if(previous){
      setPage(previous);
      setPageHistory(old=>old.slice(0,-1));
      if(previous!=="case-detail")setActiveCase(null);
    } else {
      setPage("games");setPageHistory([]);setActiveCase(null);
    }
  };
  useEffect(()=>{
    const back=tg?.BackButton;
    if(page!=="games"){
      back?.show();
      const handleBack=()=>goBack();
      back?.onClick(handleBack);
      return()=>{back?.offClick(handleBack);back?.hide();};
    }
    back?.hide();
  },[page,pageHistory,opening,upgradeBusy]);
  const openGiftModal=(gift:GiftItem,inventoryUid="")=>{setModalGift(gift);setModalInventoryUid(inventoryUid);};

  const openFreeCaseTasks=async()=>{
    setFreeCaseModalOpen(true);
    setFreeCaseTaskCheck(null);
    if(token){
      try{await refreshFreeCaseInfo();}catch{}
    }
  };
  const shareFreeCaseWithFriends=()=>{
    if(!tg?.shareMessage){notify("Открой CloudeGift в Telegram и обнови приложение до последней версии");return;}
    if(!sharePrepared){notify(sharePreparing?"Готовим сообщение…":"Не удалось подготовить сообщение. Попробуй ещё раз");return;}
    const prepared=sharePrepared;
    setShareSending(true);
    try{
      tg.shareMessage(prepared.message_id,async(sent:boolean)=>{
        setShareSending(false);
        if(!sent){notify("Отправка отменена");return;}
        try{
          const result:any=await api("/api/free-case/share/complete",{share_token:prepared.share_token});
          setSharePrepared(null);
          const info:any=await refreshFreeCaseInfo();
          setFreeCaseTaskCheck(old=>{
            const shareDone=Number(result.shares_sent)>=3;
            if(old)return {share:shareDone,channel:old.channel};
            return shareDone?{share:true,channel:!!info?.subscribed}:null;
          });
          notify(Number(result.shares_sent)>=3?"Отправка подтверждена":"Сообщение отправлено");
        }catch(error:any){
          setSharePrepared(null);
          notify("Не удалось подтвердить отправку: "+error.message);
        }
      });
    }catch(error:any){
      setShareSending(false);
      notify("Telegram не смог открыть отправку: "+(error?.message||"ошибка"));
    }
  };
  const openFreeCaseChannel=()=>{
    const url=freeCaseInfo?.channel_url;
    if(!freeCaseInfo?.channel_configured || !url){notify("Ссылка на канал ещё не настроена");return;}
    openTelegramUrl(url);
  };
  const verifyFreeCaseTasks=async()=>{
    if(!token){notify("Подключи Telegram и backend, чтобы проверить условия");return;}
    setFreeCaseChecking(true);
    try{
      const result:any=await api("/api/free-case/tasks/check",{});
      setFreeCaseInfo((old:any)=>({...old,...result}));
      setFreeCaseTaskCheck({share:!!result.share_complete,channel:!!result.subscribed});
      if(result.tasks_complete){
        setFreeCaseModalOpen(false);
        notify("Условия выполнены. Бесплатный кейс открыт для тебя");
      }else if(!result.channel_configured){
        notify("Канал ещё не подключён к настройкам бота");
      }else{
        notify("Не все условия выполнены");
      }
    }catch(error:any){notify("Не удалось проверить условия: "+error.message);}
    finally{setFreeCaseChecking(false);}
  };

  async function openCase(c:CaseItem,fast=false) {
    const count=c.id==="free-case"?1:Math.max(1,Math.min(5,caseOpenCount));
    const totalCost=c.price_stars*count;
    if(c.id==="free-case"){
      if(!token){await openFreeCaseTasks();notify("Для открытия подключи Telegram и backend");return;}
      try{
        const info:any=await refreshFreeCaseInfo();
        if(!info?.tasks_complete){
          setFreeCaseTaskCheck({share:!!info?.share_complete,channel:!!info?.subscribed});
          setFreeCaseModalOpen(true);
          return;
        }
        if(!info?.can_open){
          notify(`Следующее открытие через ${formatCompactCountdown(Number(info?.remaining_ms)||0)}`);
          return;
        }
      }catch(error:any){notify("Не удалось проверить бесплатный кейс: "+error.message);return;}
    }
    if(totalCost>0 && balance<totalCost){notify("Недостаточно ⭐ на балансе");return;}
    tap();
    setOpening(true);
    setRoulettePrizes(null);
    setRouletteFastMode(c.id==="free-case"?false:fast);
    setBatchResults(null);
    setResultGift(null);
    setResultStars(null);
    setLastWonInventoryUid("");
    try {
      let prizes:CasePrize[]=[];
      if(c.id==="free-case") {
        const res:any=await api("/api/free-case/open",{});
        setBalance(res.balance);
        setFreeCaseInfo((old:any)=>({...old,can_open:false,next_open_at:res.next_open_at,remaining_ms:res.remaining_ms}));
        if(res.prize_type==="gift" && res.gift) {
          prizes=[{gift_id:res.gift.id,weight_bp:0}];
          if(res.inventory_id) {
            const inventoryUid=String(res.inventory_id);
            addOwned(res.gift.id,inventoryUid);
            setLastWonInventoryUid(inventoryUid);
          }
        } else {
          prizes=[{gift_id:`stars-${res.star_reward||2}`,weight_bp:0}];
        }
      } else if(token) {
        const res:any=await api(`/api/cases/${c.id}/open-batch`,{count});
        setBalance(res.balance);
        prizes=(res.results||[]).map((result:any)=>({gift_id:result.gift_id,weight_bp:0}));
        let lastUid="";
        (res.results||[]).forEach((result:any)=>{
          if(result.inventory_id){lastUid=addOwned(result.gift_id,String(result.inventory_id));}
        });
        if(lastUid)setLastWonInventoryUid(lastUid);
      } else {
        prizes=Array.from({length:count},()=>pickDemoCasePrize(c));
        const starReturn=prizes.reduce((sum,prize)=>sum+(isStarPrize(prize)?starPrizeAmount(prize):0),0);
        setBalance(value=>value-totalCost+starReturn);
        let lastUid="";
        prizes.forEach(prize=>{if(!isStarPrize(prize))lastUid=addOwned(prize.gift_id);});
        if(lastUid)setLastWonInventoryUid(lastUid);
      }
      if(!prizes.length)throw new Error("Сервер не вернул результаты открытия");
      setRoulettePrizes(prizes);
    } catch(e:any) {
      setOpening(false);
      setRoulettePrizes(null);
      notify("Не удалось открыть кейс: "+e.message);
    }
  }
  const finishRoulette=()=>{
    if(!roulettePrizes?.length)return;
    const prizes=roulettePrizes;
    setOpening(false);
    setRoulettePrizes(null);
    setRouletteFastMode(false);
    if(prizes.length===1){
      const prize=prizes[0];
      if(isStarPrize(prize))setResultStars(starPrizeAmount(prize));
      else {const gift=byId.get(prize.gift_id);if(gift)setResultGift(gift);}
    }else setBatchResults(prizes);
  };

  async function sellInventory(uid:string) {
    const owned=inventory.find(x=>x.uid===uid);
    const gift=owned?byId.get(owned.giftId):undefined;
    if(!owned||!gift)return;
    try {
      if(token && /^\d+$/.test(uid)) {
        const res:any=await api(`/api/inventory/${uid}/sell`,{});
        setBalance(res.balance);
      } else setBalance(v=>v+gift.price_stars);
      removeOwned(uid);setModalGift(null);setModalInventoryUid("");
      notify(`${gift.name} продан за ${fmt(gift.price_stars)} ⭐`);
    } catch(e:any){notify("Не удалось продать подарок: "+e.message);}
  }
  const startGiftWithdrawal=(uid:string)=>{
    setWithdrawType("gift");setWithdrawInventoryUids([uid]);setWithdrawDestination("");
    setModalGift(null);setModalInventoryUid("");setWithdrawOpen(true);
  };
  const startStarsWithdrawal=()=>{
    setWithdrawType("stars");setWithdrawInventoryUids([]);setWithdrawDestination("");
    setWithdrawOpen(true);
  };
  async function submitWithdrawal() {
    const destination=withdrawDestination.trim();
    if(!destination){notify("Укажи адрес или Telegram для получения");return;}
    const amount=Math.max(1,Math.floor(Number(withdrawAmount)||0));
    if(withdrawType==="stars"&&amount<1500){notify("Минимальный вывод — 1500 ⭐");return;}
    if(withdrawType==="stars"&&amount>balance){notify("Недостаточно звёзд на балансе");return;}
    if(withdrawType==="gift"&&withdrawInventoryUids.length<2){notify("Выбери минимум 2 NFT");return;}
    if(withdrawType==="gift"&&withdrawInventoryUids.some(uid=>!inventory.some(x=>x.uid===uid))){notify("Один из подарков больше недоступен");return;}
    try {
      if(token) {
        const body:any={asset_type:withdrawType,destination};
        if(withdrawType==="stars")body.amount=amount;
        else body.inventory_ids=withdrawInventoryUids.map(Number);
        const res:any=await api("/api/withdrawals",body);
        if(withdrawType==="stars")setBalance(res.balance??(balance-amount));
        else withdrawInventoryUids.forEach(removeOwned);
        setWithdrawals(old=>[{id:res.id,asset_type:withdrawType,amount:withdrawType==="stars"?amount:null,gift_id:null,gift_count:withdrawType==="gift"?withdrawInventoryUids.length:0,status:"pending",submitted_at:res.submitted_at,destination},...old]);
      } else {
        const request:WithdrawalRequest={id:Date.now(),asset_type:withdrawType,amount:withdrawType==="stars"?amount:null,gift_id:null,status:"pending",submitted_at:new Date().toISOString(),destination};
        setWithdrawals(old=>[request,...old]);
        if(withdrawType==="stars")setBalance(v=>v-amount);else withdrawInventoryUids.forEach(removeOwned);
      }
      setWithdrawOpen(false);
      notify("Заявка принята. Статус доступен в разделе «Вывести» → «Мои заявки».");
    } catch(e:any){notify("Не удалось создать заявку: "+e.message);}
  }

  async function buyGift(g:GiftItem) {
    if(balance<g.price_stars){notify("Недостаточно ⭐ на балансе");return;}
    try {
      if(token) {
        const res:any=await api(`/api/shop/${g.id}/buy`,{});
        setBalance(res.balance); addOwned(g.id,String(res.inventory_id));
      } else {
        setBalance(v=>v-g.price_stars); addOwned(g.id);
      }
      setModalGift(null); notify(`${g.name} добавлен в инвентарь`); tap();
    } catch(e:any){notify("Покупка не прошла: "+e.message);}
  }

  async function topup() {
    const amount=Math.max(1,Math.floor(Number(topupAmount)||0));
    if(!amount){notify("Укажи сумму");return;}
    try {
      const res:any=await api("/api/payments/stars/invoice",{amount});
      if(res.invoice_url && tg?.openInvoice) {
        tg.openInvoice(res.invoice_url,(status)=>{
          if(status==="paid") notify("Платёж принят, баланс обновится автоматически");
          else if(status==="failed") notify("Платёж не прошёл");
        });
      } else notify("Счёт создан. Открой его в Telegram.");
      setTopupOpen(false);
    } catch {
      notify("Пополнение включится после настройки Telegram-бота. Сейчас это демо.");
    }
  }

  async function redeemPromo() {
    if(!promo.trim()){notify("Введи промокод");return;}
    try {
      const res:any=await api("/api/promos/redeem",{code:promo.trim().toUpperCase()});
      setBalance(res.balance); setPromo(""); notify("Промокод активирован");
    } catch { notify("Промокод не найден или уже использован"); }
  }

  const shopItems=useMemo(()=>{
    return gifts.filter(g=>
      g.name.toLowerCase().includes(search.toLowerCase()) &&
      (rarityFilter==="Все"||g.rarity===rarityFilter) &&
      (shopCategory==="Все"||g.rarity===shopCategory)
    ).sort((a,b)=>sort==="asc"?a.price_stars-b.price_stars:b.price_stars-a.price_stars);
  },[search,sort,rarityFilter,shopCategory]);

  const nav=[
    {id:"games" as Page,label:"Игры",icon:Gamepad2},
    {id:"leaders" as Page,label:"Лидеры",icon:Trophy},
    {id:"shop" as Page,label:"Магазин",icon:ShoppingBag},
    {id:"profile" as Page,label:"Профиль",icon:UserCircle},
  ];

  return <MotionConfig reducedMotion="user"><div className={`app-shell ${page==="profile"?"is-profile":""}`}>
    {page==="profile"&&<div className="profile-clouds" aria-hidden="true"/>}
    <header className="topbar">
      <button className="brand" type="button" aria-label="CloudeGift — на главную" onClick={()=>goRoot("games")}>
        <img className="brand-logo" src="/assets/cloudegift-logo.png" alt="CloudeGift" />
      </button>
      <button
        className="balance-pill header-balance"
        type="button"
        aria-label={`Баланс: ${fmt(balance)} звёзд. Пополнить баланс`}
        title="Пополнить баланс"
        onClick={showTopup}
      >
        <CurrencyIcon/><span>{fmt(balance)}</span><Plus size={19} strokeWidth={3}/>
      </button>
    </header>
    {page!=="profile" && ["games","cases","case-detail","free-case"].includes(page) && <div className="global-live-wrap">{liveDrops.length>0&&<LiveFeed items={liveDrops}/>}</div>}

    <main className="main-content">
    <AnimatePresence mode="wait" initial={false}><motion.div key={page} className="screen-transition" initial={{opacity:0,y:reducedMotion?0:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reducedMotion?0:-6}} transition={{duration:reducedMotion?0:.22,ease:[.22,1,.36,1]}}>
      {!["games","leaders","shop","profile"].includes(page) && <button className="back-button global-back" onClick={goBack}><ArrowLeft size={18}/> Назад</button>}
      {page==="games" && <GamesHome onOpen={go} onToast={notify}/>}
      {page==="cases" && <CasesScreen onChoose={(c)=>{setActiveCase(c);setCaseOpenCount(1);setCaseFastMode(false);go("case-detail");}}/>}
      {page==="free-case" && <FreeCasesScreen onChoose={(c)=>{setActiveCase(c);setCaseOpenCount(1);setCaseFastMode(false);go("case-detail");}}/>}
      {page==="case-detail" && activeCase && <CaseDetail c={activeCase} opening={opening} roulettePrizes={roulettePrizes} rouletteFastMode={rouletteFastMode} openCount={caseOpenCount} fastMode={caseFastMode} onFastModeChange={setCaseFastMode} onCountChange={setCaseOpenCount} freeCaseRemainingMs={freeCaseRemainingMs} onOpen={(fast)=>openCase(activeCase,fast)} onRouletteComplete={finishRoulette}/>}
      {page==="shop" && <ShopScreen items={shopItems} search={search} setSearch={setSearch} sort={sort} setSort={setSort} rarity={rarityFilter} setRarity={setRarityFilter} onGift={(g)=>openGiftModal(g)} />}
      {page==="leaders" && <LeadersScreen />}
      {page==="profile" && <ProfileScreen name={displayName} photoUrl={photoUrl} inventory={inventory} onTopup={showTopup} onWithdraw={startStarsWithdrawal} onGift={(g,uid)=>openGiftModal(g,uid)} onAdmin={()=>go("admin")} isAdmin={adminAllowed}/> }
      {page==="upgrade" && <UpgradeScreen inventory={inventory} initialUid={upgradeInitialUid} token={token} onBack={goBack} onRemove={removeOwned} onAdd={addOwned} onToast={notify} onBusy={setUpgradeBusy}/>}
      {page==="slots" && <SlotsScreen balance={balance} setBalance={setBalance} token={token} onToast={notify} onPrize={addOwned}/>}
      {page==="mines" && <MinesScreen balance={balance} setBalance={setBalance} token={token} onToast={notify}/>}
      {page==="admin" && <AdminScreen onBack={goBack} token={token} onToast={notify} ownId={userId} onRefresh={refreshAccount} />}
    </motion.div></AnimatePresence>
    </main>

    {["games","leaders","shop","profile"].includes(page) && <nav className="bottom-nav" aria-label="Основная навигация">
      {nav.map(n=><button key={n.id} aria-current={page===n.id?"page":undefined} className={page===n.id?"active":""} onClick={()=>goRoot(n.id)}>
        {page===n.id&&<motion.span className="nav-active-pill" layoutId="navigation-pill" transition={{type:"spring",stiffness:360,damping:34}}/>}<n.icon size={21} strokeWidth={1.8}/><span className="nav-label">{n.label}</span>
      </button>)}
    </nav>}

    <AnimatePresence>
      {modalGift && <Modal onClose={()=>{setModalGift(null);setModalInventoryUid("");}}>
        <div className="gift-modal">
          <div className="gift-modal-art"><GiftImage gift={modalGift}/></div>
          <h2>{modalGift.name}</h2>
          <div className={`rarity ${rarityClass(modalGift.rarity)}`}>{modalGift.rarity}</div>
          <StarPrice value={modalGift.price_stars}/>
          {modalInventoryUid ? <>
            <div className="inventory-modal-actions">
              <Button onClick={()=>startGiftWithdrawal(modalInventoryUid)}><ArrowDownToLine size={17}/> Вывести</Button>
              <Button kind="ghost" onClick={()=>{setUpgradeInitialUid(modalInventoryUid);setModalGift(null);setModalInventoryUid("");go("upgrade");}}><TrendingUp size={17}/> Улучшить</Button>
              <Button kind="white" onClick={()=>sellInventory(modalInventoryUid)}>Продать за <CurrencyIcon/> {fmt(modalGift.price_stars)}</Button>
            </div>
            <p className="modal-hint">Продажа зачислит указанную каталожную стоимость на баланс.</p>
          </> : <>
            <Button kind="white" onClick={()=>buyGift(modalGift)}>Купить за <CurrencyIcon/> {fmt(modalGift.price_stars)}</Button>
            <p className="modal-hint">Подарок появится в твоём инвентаре</p>
          </>}
        </div>
      </Modal>}
      {resultGift && <Modal onClose={()=>setResultGift(null)}>
        <div className="result-modal">
          <ConfettiBurst/>
          <div className="result-label"><Sparkles size={16}/> ТВОЙ ВЫИГРЫШ</div>
          <div className="result-art"><GiftImage gift={resultGift}/></div>
          <h2>{resultGift.name}</h2>
          <div className={`rarity ${rarityClass(resultGift.rarity)}`}>{resultGift.rarity}</div>
          <StarPrice value={resultGift.price_stars}/>
          <div className="result-actions">
            <Button onClick={()=>setResultGift(null)}>Забрать</Button>
            {lastWonInventoryUid&&<Button kind="ghost" onClick={()=>{setResultGift(null);setUpgradeInitialUid(lastWonInventoryUid);go("upgrade");}}><TrendingUp size={16}/> Улучшить</Button>}
            {lastWonInventoryUid&&<Button kind="ghost" onClick={()=>{const uid=lastWonInventoryUid;setResultGift(null);sellInventory(uid);}}>Продать за {fmt(resultGift.price_stars)} ⭐</Button>}
          </div>
        </div>
      </Modal>}
      {resultStars!==null && <Modal onClose={()=>setResultStars(null)}>
        <div className="result-modal star-result-modal">
          <ConfettiBurst/>
          <div className="result-label"><Sparkles size={16}/> ТВОЙ ВЫИГРЫШ</div>
          <div className={`star-prize-visual result-star-visual ${starTier(resultStars)}`}><CurrencyIcon/><b>{fmt(resultStars)}</b></div>
          <h2>Тебе выпало {fmt(resultStars)} звёзд</h2>
          <p className="modal-hint">Звёзды уже зачислены на баланс</p>
          <Button onClick={()=>setResultStars(null)}>Отлично</Button>
        </div>
      </Modal>}
      {batchResults && <Modal onClose={()=>setBatchResults(null)}>
        <div className="result-modal batch-result-modal">
          <ConfettiBurst/>
          <div className="result-label"><Sparkles size={16}/> РЕЗУЛЬТАТЫ ОТКРЫТИЯ</div>
          <h2>Выпало подарков: {batchResults.length}</h2>
          <div className="batch-result-grid">
            {batchResults.map((prize,index)=>{
              const gift=byId.get(prize.gift_id);
              const value=isStarPrize(prize)?starPrizeAmount(prize):(gift?.price_stars||0);
              return <div className="batch-result-item" key={`${prize.gift_id}-${index}`}>
                <div className="batch-result-art">{isStarPrize(prize)?<PrizeVisual prize={prize}/>:gift?<GiftImage gift={gift}/>:<Package/>}</div>
                <b>{prizeName(prize)}</b>
                <StarPrice value={value}/>
              </div>;
            })}
          </div>
          <p className="modal-hint">Выигрыши добавлены в баланс и инвентарь</p>
          <Button onClick={()=>setBatchResults(null)}>Забрать</Button>
        </div>
      </Modal>}

      {freeCaseModalOpen && <Modal onClose={()=>setFreeCaseModalOpen(false)}>
        <div className="free-case-task-modal">
          <div className="free-case-task-heading">
            <h2>Выполните условия</h2>
            <p>Чтобы открыть этот кейс</p>
          </div>
          <div className="free-case-task-list">
            <button type="button" className="free-case-task-row" onClick={shareFreeCaseWithFriends} disabled={shareSending||sharePreparing||!!freeCaseInfo?.share_complete}>
              <span className="free-case-task-icon share"><Mail size={21} fill="currentColor" strokeWidth={1.7}/></span>
              <span className="free-case-task-copy"><b>Отправьте 3 друзьям</b><small>Поделитесь сообщением в 3 своих чатах</small></span>
              {freeCaseTaskCheck && <span className={`free-case-task-status ${freeCaseTaskCheck.share?"ok":"bad"}`}>{freeCaseTaskCheck.share?<Check size={13}/>:<X size={13}/>}</span>}
              {!freeCaseTaskCheck && <ChevronRight className="free-case-task-arrow" size={19}/>}
            </button>
            <button type="button" className="free-case-task-row" onClick={openFreeCaseChannel}>
              <span className="free-case-task-icon channel"><Bot size={21} fill="currentColor" strokeWidth={1.6}/></span>
              <span className="free-case-task-copy"><b>Подпишитесь на канал</b><small>И вернитесь сюда</small></span>
              {freeCaseTaskCheck && <span className={`free-case-task-status ${freeCaseTaskCheck.channel?"ok":"bad"}`}>{freeCaseTaskCheck.channel?<Check size={13}/>:<X size={13}/>}</span>}
              {!freeCaseTaskCheck && <ChevronRight className="free-case-task-arrow" size={19}/>}
            </button>
          </div>
          <Button kind="white" disabled={freeCaseChecking} onClick={verifyFreeCaseTasks}>{freeCaseChecking?"Проверяем…":"Я выполнил"}</Button>
        </div>
      </Modal>}
      {topupOpen && <Modal onClose={()=>setTopupOpen(false)}>
        <div className="topup-modal">
          <div className="modal-heading"><Wallet/> Пополнить баланс</div>
          <div className="payment-tabs payment-tabs-three">
            <button className={topupMethod==="gram"?"selected":""} onClick={()=>setTopupMethod("gram")}><CurrencyIcon kind="gram"/> GRAM</button>
            <button className={topupMethod==="stars"?"selected":""} onClick={()=>setTopupMethod("stars")}><CurrencyIcon/> Stars</button>
            <button className={topupMethod==="gift"?"selected":""} onClick={()=>setTopupMethod("gift")}>🎁 Подарком</button>
          </div>
          <AnimatePresence mode="wait" initial={false}><motion.div className="payment-panel" key={topupMethod} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.2,ease:[.22,1,.36,1]}}>
          {topupMethod==="stars" && <>
            <label>Сумма пополнения</label>
            <div className="topup-amount-display"><strong>{fmt(Number(topupAmount)||0)}</strong><CurrencyIcon/></div>
            <input className="amount-input" type="number" min="1" value={topupAmount} onChange={e=>setTopupAmount(e.target.value)}/>
            <div className="quick-amounts">{[100,500,1000,5000].map(x=><button key={x} onClick={()=>setTopupAmount(String(x))}>+{fmt(x)} ⭐</button>)}</div>
            <Button onClick={topup}>Оплатить звёздами</Button>
            <p className="modal-hint">Оплата проходит через официальный счёт Telegram Stars.</p>
          </>}
          {topupMethod==="gram" && <div className="gram-deposit-flow">
            <label>Сумма пополнения в GRAM</label>
            <div className="topup-amount-display"><strong>{fmt(Number(gramAmount)||0)}</strong><CurrencyIcon kind="gram"/></div>
            <input className="amount-input" type="number" min="1" value={gramAmount} onChange={e=>setGramAmount(e.target.value)}/>
            <div className="quick-amounts">{[1,5,10,100].map(x=><button key={x} onClick={()=>setGramAmount(String(x))}>+{x} GRAM</button>)}</div>
            <div className="deposit-copy-row"><span><small>Кошелёк для перевода</small><b>{gramWallet||"Пополнение пока недоступно"}</b></span><button disabled={!gramWallet} onClick={()=>copyText(gramWallet,"Адрес кошелька")}><Copy size={16}/></button></div>
            <div className="deposit-copy-row"><span><small>Уникальный комментарий (memo)</small><b>{gramMemo}</b></span><button onClick={()=>copyText(gramMemo,"Мемо-код")}><Copy size={16}/></button></div>
            <Button onClick={openGramTopup}><Wallet size={17}/> Открыть Tonkeeper</Button>
            <p className="modal-hint">В Tonkeeper выбери токен GRAM и введи {fmt(Number(gramAmount)||0)} GRAM. Адрес и уникальный memo будут подготовлены автоматически. Зачисление выполняется после проверки транзакции.</p>
            {!gramWallet&&<p className="deposit-setup-warning">Этот способ пополнения пока не подключён. Выберите Stars или подарок.</p>}
          </div>}
          {topupMethod==="gift" && <div className="gift-deposit-flow">
            <div className="deposit-accepted-card">
              <div className="deposit-gift-models">{["durovsglasses-1","astralshard-1","heroichelmet-1"].map(id=>{const gift=byId.get(id);return gift?<GiftImage key={id} gift={gift}/>:null;})}</div>
              <div><b>NFT-подарки Telegram</b><strong>Принимаем по текущей рыночной стоимости</strong></div>
              <CheckCircle2 size={22}/>
            </div>
            <div className="deposit-rejected-card"><div className="deposit-gift-models muted-gifts"><TgsSticker src="/assets/stickers/bouquet.tgs" label="Букет" fallback="💐"/><TgsSticker src="/assets/stickers/bow.tgs" label="Бант" fallback="🎀"/><TgsSticker src="/assets/stickers/teddy-bear.tgs" label="Медвежонок" fallback="🧸"/></div><div><b>Обычные подарки</b><strong>Не принимаются для пополнения</strong></div><XCircle size={22}/></div>
            <div className="deposit-steps">
              <div><b>1</b><span>Отправьте NFT-подарок в чат <strong>@cloudegift</strong></span></div>
              <div><b>2</b><span>Мы проверим модель и рыночную стоимость</span></div>
              <div><b>3</b><span>После проверки начислим звёзды на ваш баланс</span></div>
            </div>
            <Button onClick={()=>{setTopupOpen(false);openTelegramUrl("https://t.me/cloudegift");}}> <Gift size={17}/> Отправить NFT</Button>
            <p className="modal-hint">Кнопка откроет личный чат CloudeGift. Обычные подарки и подарки без возможности проверки не принимаются.</p>
          </div>}
          </motion.div></AnimatePresence>
          <details className="payment-promo"><summary>У меня есть промокод</summary><form onSubmit={event=>{event.preventDefault();redeemPromo();}}><input aria-label="Промокод" placeholder="Введите код" value={promo} onChange={e=>setPromo(e.target.value)}/><button disabled={!promo.trim()} type="submit">Применить</button></form></details>
        </div>
      </Modal>}
      {withdrawOpen && <Modal onClose={()=>setWithdrawOpen(false)}>
        <div className="withdraw-modal">
          <div className="modal-heading"><ArrowDownToLine/> {withdrawType==="stars"?"Заявка на вывод звёзд":"Заявка на вывод NFT"}</div>
          {withdrawType==="stars" ? <>
            <label>Сумма вывода</label>
            <input className="amount-input" type="number" min="1500" max={balance} value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)}/>
            <div className="withdraw-available">Минимум: 1 500 ⭐ · Доступно: {fmt(balance)} ⭐</div>
          </> : <>
            <div className="withdraw-available">Для заявки выбери минимум 2 NFT. Выбрано: {withdrawInventoryUids.length}</div>
            <div className="withdraw-nft-picker">{inventory.map(item=>{const gift=byId.get(item.giftId);if(!gift)return null;const checked=withdrawInventoryUids.includes(item.uid);return <button type="button" key={item.uid} className={checked?"selected":""} onClick={()=>setWithdrawInventoryUids(old=>checked?old.filter(x=>x!==item.uid):[...old,item.uid])}><GiftImage gift={gift}/><span>{gift.name}</span><small>{checked?"Выбрано":"Выбрать"}</small></button>;})}</div>
          </>}
          <label>{withdrawType==="stars"?"TON-адрес или контакт для связи":"Telegram username получателя"}</label>
          <input className="amount-input" value={withdrawDestination} onChange={e=>setWithdrawDestination(e.target.value)} placeholder={withdrawType==="stars"?"UQ... или @username":"@username"}/>
          <Button onClick={submitWithdrawal}>Отправить заявку</Button>
          <p className="modal-hint">Минимальные условия: 1 500 ⭐ или 2 NFT-подарка. После подачи появится запись с датой и текущим статусом. Отправка выполняется вручную после проверки; срок не гарантируется.</p><details className="withdraw-history"><summary>Мои заявки · {withdrawals.length}</summary>{withdrawals.length?withdrawals.map(w=><div className="account-withdrawal" key={w.id}><ArrowUpRight size={18}/><div className="account-withdrawal-copy"><b>{w.asset_type==="stars"?`${fmt(w.amount||0)} Stars`:w.gift_name||"NFT-подарки"}</b><time>{prettyDate(w.submitted_at)}</time></div><span className={`account-status status-${w.status}`}>{{pending:"Ожидает",processing:"В обработке",paid:"Выполнен",rejected:"Отклонён"}[w.status]||w.status}</span></div>):<p className="modal-hint">Заявок пока нет</p>}</details>
        </div>
      </Modal>}
    </AnimatePresence>
    {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
  </div>
  <AnimatePresence>{introVisible&&<IntroSplash onDone={()=>setIntroVisible(false)}/>}</AnimatePresence>
  </MotionConfig>;
}

function IntroSplash({onDone}:{onDone:()=>void}) {
  const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    try{sessionStorage.setItem("cg_intro_seen","1");}catch{}
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){onDone();return;}
    const fallback=window.setTimeout(onDone,5000);
    const video=videoRef.current;
    if(video){
      const play=video.play();
      if(play&&typeof play.catch==="function")play.catch(()=>onDone());
    }
    return()=>window.clearTimeout(fallback);
  },[]);
  return <motion.div className="intro-splash" initial={{opacity:1}} exit={{opacity:0}} transition={{duration:.38}}>
    <video ref={videoRef} src="/assets/cloudegift-intro.mp4" autoPlay muted playsInline preload="auto"
      onEnded={onDone} onError={onDone} onClick={onDone}/>
    <button className="intro-skip" onClick={onDone}>Пропустить <ArrowRight size={16}/></button>
  </motion.div>;
}

function LiveFeed({items}:{items:any[]}) {
  const prizes=items.filter((item:any)=>Number(item.star_reward)>0 || !!item.gift_image);
  // Separate visual demo stream. It does not create wins, balance changes or API requests.
  const makeDemoDrop=()=>{
    const roll=Math.random();
    if(roll<0.24){
      const amounts=[10,25,50,80,100,250,500,1000,2500];
      return {id:`demo-stars-${Date.now()}-${Math.random()}`,star_reward:amounts[Math.floor(Math.random()*amounts.length)]};
    }
    const pool=gifts.filter((gift)=>!!gift.image);
    const gift=pool[Math.floor(Math.random()*pool.length)]||gifts[0];
    return {id:`demo-gift-${Date.now()}-${Math.random()}`,gift_image:gift?.image||null};
  };
  const [demoPrizes,setDemoPrizes]=useState<any[]>(()=>Array.from({length:8},makeDemoDrop));
  useEffect(()=>{
    const timer=window.setInterval(()=>setDemoPrizes(old=>[makeDemoDrop(),...old].slice(0,12)),2600);
    return()=>window.clearInterval(timer);
  },[]);
  const renderPrizes=(list:any[],prefix:string)=><div className="live-feed-content">
    {list.slice(0,12).map((item:any)=>item.star_reward
      ? <motion.div className="live-prize live-prize-stars" key={`${prefix}-${item.id}`}
          initial={{opacity:0,x:12,scale:.9}} animate={{opacity:1,x:0,scale:1}}
          transition={{duration:.22,ease:"easeOut"}}>
          <CurrencyIcon/><b>{fmt(item.star_reward)}</b>
        </motion.div>
      : <motion.div className="live-prize live-prize-gift" key={`${prefix}-${item.id}`}
          initial={{opacity:0,x:12,scale:.88}} animate={{opacity:1,x:0,scale:1}}
          transition={{duration:.22,ease:"easeOut"}}>
          <img src={`/${String(item.gift_image)}`} alt="" loading="lazy"/>
        </motion.div>
    )}
  </div>;
  return <div className="live-feed-stack" aria-label="Лента выигрышей и демонстрация призов">
    <div className="live-feed live-feed-prizes" aria-label="LIVE — реальные выигрыши">
      <div className="live-feed-label"><span className="live-dot"/>LIVE</div>
      {renderPrizes(prizes,"live")}
    </div>
    <div className="live-feed live-feed-prizes live-feed-demo-row" aria-label="ДЕМО — демонстрационные призы">
      <div className="live-feed-label">ДЕМО</div>
      {renderPrizes(demoPrizes,"demo")}
    </div>
  </div>;
}

function MenuCaseIcon() {
  const cat=byId.get("scaredcat-1");
  const peach=byId.get("preciouspeach-1");
  return <div className="menu-case-icon" aria-hidden="true">
    {cat&&<GiftImage gift={cat} className="menu-case-gift menu-case-cat"/>}
    {peach&&<GiftImage gift={peach} className="menu-case-gift menu-case-peach"/>}
  </div>;
}
function MenuCrashIcon() {
  return <div className="menu-crash-icon" aria-hidden="true"><Cloud size={62} strokeWidth={1.7}/><Plane size={34} strokeWidth={1.9}/></div>;
}
function GamesHome({onOpen}:{onOpen:(p:Page)=>void;onToast:(s:string)=>void}) {
  const games=[
    {id:"upgrade" as Page,title:"Апгрейд",desc:"Обмен с шансом на большее",icon:TrendingUp,theme:"upgrade"},
    {id:"slots" as Page,title:"Слоты",desc:"Крутите NFT и ловите три совпадения",icon:Grid3X3,theme:"slots"},
    {id:"mines" as Page,title:"Мины",desc:"Открывайте безопасные клетки",icon:Bomb,theme:"mines"},
  ];
  return <div className="page-stack home-games">
    <div className="page-title home-heading"><h1>Игры</h1><span>CloudeGift</span></div>
    <button className="home-feature home-banner" onClick={()=>onOpen("cases")} aria-label="Кейсы — выбейте новый подарок для своей коллекции"><img src="/assets/banners/cases-collection.png" alt="Кейсы. Выбейте новый подарок для своей коллекции" fetchPriority="high"/></button>
    <button className="daily-case" onClick={()=>onOpen("free-case")}><span className="daily-case-icon"><img src="/assets/banners/free-case.png" alt=""/></span><span><b>Бесплатный кейс</b><small>Раз в 24 часа после заданий</small></span><ChevronRight size={19}/></button>
    <div className="section-row home-section-heading"><h2>Другие игры</h2><span className="muted">Выберите режим</span></div>
    <div className="home-game-grid">
      {games.map(game=><button key={game.id} className={`home-game home-game-${game.theme}`} onClick={()=>onOpen(game.id)}><span className="home-game-icon"><game.icon size={27} strokeWidth={1.5}/></span><ArrowUpRight className="home-game-arrow" size={16}/><h3>{game.title}</h3><p>{game.desc}</p></button>)}
    </div>
  </div>;
}


type SlotsSpinResult = { won:boolean; gift:GiftItem|null; gift_id:string|null; inventory_id:number|null; balance:number; bet:number; roll:number; win_probability:number };

function shuffleSlotGifts(source:GiftItem[]) {
  const result=[...source];
  for(let i=result.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

function buildSlotReel(target:GiftItem, targetIndex:number) {
  const pool=shuffleSlotGifts(gifts);
  while(pool.length<targetIndex) pool.push(gifts[Math.floor(Math.random()*gifts.length)]);
  pool.splice(targetIndex,0,target);
  return pool;
}

function SlotsScreen({balance,setBalance,token,onToast,onPrize}:{balance:number;setBalance:React.Dispatch<React.SetStateAction<number>>;token:string;onToast:(s:string)=>void;onPrize:(giftId:string,uid?:string)=>string}) {
  const [bet,setBet]=useState(25);
  const [busy,setBusy]=useState(false);
  const [spinning,setSpinning]=useState(false);
  const [spinKey,setSpinKey]=useState(0);
  const [reels,setReels]=useState<GiftItem[][]>(()=>[
    gifts.slice(0,3),
    gifts.slice(1,4),
    gifts.slice(2,5)
  ]);
  const [result,setResult]=useState<SlotsSpinResult|null>(null);
  const targetIndex=gifts.length+12;
  const rowHeight=76;

  useEffect(()=>{
    if(!spinning)return;
    const timer=window.setTimeout(()=>{
      setSpinning(false);
      setBusy(false);
    },3900);
    return ()=>window.clearTimeout(timer);
  },[spinning,spinKey]);

  const changeBet=(delta:number)=>setBet(current=>Math.max(25,Math.min(1_000_000,balance,current+delta)));
  const spin=async()=>{
    if(busy)return;
    if(!token){onToast("Подключи Telegram-профиль, чтобы играть в слоты");return;}
    if(bet<25||bet>balance){onToast("Ставка минимум 25 ⭐ и не больше баланса");return;}
    setBusy(true);setResult(null);tap();
    try{
      const response=await api<SlotsSpinResult>("/api/slots/spin",{bet});
      setBalance(response.balance);
      let targets:GiftItem[];
      if(response.won&&response.gift){
        targets=[response.gift,response.gift,response.gift];
        if(response.inventory_id)onPrize(response.gift.id,String(response.inventory_id));
      }else{
        const shuffled=shuffleSlotGifts(gifts);
        targets=shuffled.slice(0,3);
        if(targets.length<3)targets=[gifts[0],gifts[1],gifts[2]];
      }
      const nextReels=targets.map(target=>buildSlotReel(target,targetIndex));
      setReels(nextReels);
      setSpinKey(key=>key+1);
      setResult(response);
      setSpinning(true);
    }catch(error:any){
      setBusy(false);
      onToast("Не удалось запустить слоты: "+error.message);
    }
  };

  return <div className="page-stack slots-page">
    <div className="page-title slots-title"><div><h1>Слоты</h1><p>Три NFT на линии — и подарок твой</p></div><span className="slots-live-mark"><i/> LIVE</span></div>
    <section className="slots-machine" aria-label="Игровой автомат с тремя барабанами">
      <div className="slots-machine-top"><span>CloudeGift <b>SLOTS</b></span></div>
      <div className={`slots-reels ${spinning?"is-spinning":""}`}>
        <div className="slots-win-line" aria-hidden="true"><span/><span/><span/></div>
        {reels.map((items,index)=>{
          const offset=-(targetIndex*rowHeight-75);
          return <div className="slots-reel" key={`${spinKey}-${index}`}>
            <motion.div
              className="slots-reel-track"
              initial={{y:0}}
              animate={{y:spinKey>0?offset:0}}
              transition={{duration:2.85+index*.25,delay:index*.08,ease:[0.08,0.72,0.12,1]}}
            >
              {items.map((gift,itemIndex)=><div className={`slots-symbol ${spinning&&itemIndex===targetIndex?"is-target":""}`} key={`${gift.id}-${itemIndex}`}>
                <GiftImage gift={gift}/>
              </div>)}
            </motion.div>
          </div>;
        })}
      </div>
      <div className="slots-machine-footer"><span>3 БАРАБАНА</span><span>{gifts.length} NFT В ПУЛЕ</span></div>
    </section>

    {result&&!spinning&&<motion.section className={`slots-result ${result.won?"is-win":"is-lose"}`} initial={{opacity:0,y:10,scale:.97}} animate={{opacity:1,y:0,scale:1}}>
      {result.won&&result.gift?<>
        <div className="slots-result-kicker"><Sparkles size={16}/> ВЫИГРЫШ · NFT ДОБАВЛЕН В ИНВЕНТАРЬ</div>
        <div className="slots-result-gift"><GiftImage gift={result.gift}/><div><b>{result.gift.name}</b><small>{result.gift.rarity} · {fmt(result.gift.price_stars)} ⭐</small></div></div>
      </>:<>
        <div className="slots-result-kicker">ПРОКРУТКА ЗАВЕРШЕНА</div>
        <b>В этот раз без выигрыша</b>
        <small>Барабаны остановились. Попробуй ещё раз.</small>
      </>}
    </motion.section>}

    <section className="slots-controls">
      <div className="slots-bet-label"><span>ТВОЯ СТАВКА</span><span>МИНИМУМ 25 ⭐</span></div>
      <div className="slots-bet-stepper">
        <button type="button" aria-label="Уменьшить ставку" disabled={busy||bet<=25} onClick={()=>changeBet(-25)}><Minus size={19}/></button>
        <label><CurrencyIcon/><input aria-label="Ставка в Stars" type="number" min="25" max={Math.max(25,balance)} step="25" value={bet} disabled={busy} onChange={event=>setBet(Math.max(25,Math.min(1_000_000,Number(event.target.value)||25)))}/></label>
        <button type="button" aria-label="Увеличить ставку" disabled={busy||bet>=balance||bet>=1_000_000} onClick={()=>changeBet(25)}><Plus size={19}/></button>
      </div>
      <button type="button" className="slots-spin-button" onClick={spin} disabled={busy||balance<bet}>
        {busy?<><span className="slots-spinner"/> {spinning?"Крутятся барабаны…":"Запускаем…"}</>:<>КРУТИТЬ <RotateCcw size={19}/></>}
      </button>
    </section>

    <div className="slots-note"><Shield size={15}/><span>Результат каждого спина определяет сервер. При победе случайный NFT из всего каталога добавляется в инвентарь.</span></div>
  </div>;
}

function FreeCasesScreen({onChoose}:{onChoose:(c:CaseItem)=>void}) {
  return <div className="page-stack">
    <div className="page-title"><h1>Бесплатный кейс</h1><p>Одно открытие в 24 часа после выполнения заданий</p></div>
    <div className="case-grid">
      <CaseCard c={freeCase} onClick={()=>onChoose(freeCase)}/>
    </div>
  </div>;
}

function CasesScreen({onChoose}:{onChoose:(c:CaseItem)=>void}) {
  return <div className="page-stack">
    <div className="page-title"><h1>Кейсы</h1><p>Подарки и Stars в каждом кейсе</p></div>
    <div className="case-grid">{cases.map(c=><CaseCard key={c.id} c={c} onClick={()=>onChoose(c)}/>)}</div>
  </div>;
}
function CaseCard({c,onClick}:{c:CaseItem;onClick:()=>void}) {
  if(c.id==="free-case")return <button className="case-card free-art-card" onClick={()=>{tap();onClick();}} aria-label="Бесплатный кейс"><img src="/assets/banners/free-case.png" alt="Бесплатный кейс" loading="lazy"/></button>;
  const preview=c.items.filter(x=>!isStarPrize(x)).slice(0,3).map(x=>byId.get(x.gift_id)).filter(Boolean) as GiftItem[];
  return <button className={`case-card theme-${c.theme} ${c.id==="free-case"?"case-card-free":""} ${c.banner?"has-banner":""}`} onClick={()=>{tap();onClick();}}>
    {c.banner ? <div className="case-banner-art">
      <img src={`/${c.banner}`} alt={c.name} loading="lazy"/>
      <div className="case-banner-price">{c.price_stars===0?<span className="free-case-card-price">БЕСПЛАТНО</span>:<StarPrice value={c.price_stars}/>}</div>
    </div> : <>
      <div className="case-scene">
        <div className="case-orb"/>
        <div className="case-gifts">{preview.map((g,i)=><GiftImage key={g.id} gift={g} className={`case-gift gift-pos-${i}`}/>)}</div>
        <div className="case-chest"><Package size={33}/><span>CG</span></div>
        <span className="case-scene-glint"/>
      </div>
      <div className="case-card-info"><b>{c.name}</b>{c.price_stars===0?<span className="free-case-card-price">БЕСПЛАТНО</span>:<StarPrice value={c.price_stars}/>}</div>
    </>}
  </button>;
}
function CaseDetail({c,opening,roulettePrizes,rouletteFastMode,openCount,fastMode,onFastModeChange,onCountChange,freeCaseRemainingMs,onOpen,onRouletteComplete}:{c:CaseItem;opening:boolean;roulettePrizes:CasePrize[]|null;rouletteFastMode:boolean;openCount:number;fastMode:boolean;onFastModeChange:(value:boolean)=>void;onCountChange:(count:number)=>void;freeCaseRemainingMs:number;onOpen:(fast:boolean)=>void;onRouletteComplete:()=>void}) {
  const prizes=c.items.map(item=>({item,gift:byId.get(item.gift_id)})).sort((a,b)=>Number(isStarPrize(a.item))-Number(isStarPrize(b.item)));
  const count=c.id==="free-case"?1:Math.max(1,Math.min(5,openCount));
  const totalCost=c.price_stars*count;
  const multiHeight=count>1?Math.max(235,count*62+72):undefined;
  const countOptions=c.id==="free-case"?[1]:[1,2,3,4,5];
  return <div className="page-stack case-detail-page">
    <div className={`case-detail-hero theme-${c.theme} ${count>1?"case-detail-hero-multi":""}`} style={multiHeight?{height:multiHeight}:undefined}>
      <div className="case-wheel-label">{roulettePrizes?(count>1?`ОТКРЫТИЕ ×${count}`:"ОТКРЫТИЕ КЕЙСА"):opening?"ПОДГОТАВЛИВАЕМ ОТКРЫТИЕ":count>1?`${c.name} · ×${count}`:c.name}</div>
      <div className="case-wheel-pointer case-wheel-pointer-top" aria-hidden="true"/>
      <div className="case-wheel-pointer case-wheel-pointer-bottom" aria-hidden="true"/>
      {roulettePrizes
        ? <CaseRoulette c={c} selected={roulettePrizes} fast={c.id==="free-case"?false:rouletteFastMode} onComplete={onRouletteComplete}/>
        : opening
          ? <div className="case-wheel-window case-wheel-loading"><span>Подготавливаем прокрутку…</span></div>
          : <CaseMultiPreview c={c} count={count}/>}

    </div>
    <div className="case-open-footer">
      {c.id==="free-case" && freeCaseRemainingMs>0 && <div className="free-case-cooldown"><Clock3 size={14}/><b>{formatCompactCountdown(freeCaseRemainingMs)}</b></div>}
      <Button kind="primary" disabled={opening||(c.id==="free-case"&&freeCaseRemainingMs>0)} onClick={()=>onOpen(c.id==="free-case"?false:fastMode)}>
        {opening?"Открываем...":c.price_stars===0?"Открыть бесплатно":<>Открыть за <CurrencyIcon/> {fmt(totalCost)}</>}
      </Button>
      <div className="case-open-controls">
        <div className="case-count-selector" aria-label="Количество кейсов">
          {countOptions.map(n=><button key={n} type="button" className={count===n?"active":""} disabled={opening} onClick={()=>onCountChange(n)}>x{n}</button>)}
        </div>
        {c.id!=="free-case"&&<button className={`case-quick-open ${fastMode?"active":""}`} type="button" title={fastMode?"Обычная прокрутка":"Быстрая прокрутка"} aria-label="Быстрая прокрутка" aria-pressed={fastMode} disabled={opening} onClick={()=>onFastModeChange(!fastMode)}><Zap size={20} fill={fastMode?"currentColor":"none"}/></button>}
      </div>
    </div>
    <div className="section-row"><h2>Что может выпасть</h2><span className="muted">{prizes.length} призов</span></div>
    {!opening&&<div className="reel-preview-note"><span className="live-dot"/> {count>1?`Одновременно откроется ${count} кейса`:"Внутри кейса — оригинальные Telegram Gifts"}</div>}
    {c.id!=="free-case"&&<div className="case-pity-note"><Shield size={15}/><span>Дорогой NFT гарантирован на каждом 20-м открытии этого кейса. В обычных открытиях: NFT, 100 ⭐ (5%) или 300 ⭐ (1,5%).</span></div>}
    <div className="prize-carousel">
      {prizes.map(({item,gift})=>{
        const value=isStarPrize(item)?starPrizeAmount(item):(gift?.price_stars||0);
        return <div className={`prize-tile ${isStarPrize(item)?"prize-tile-stars":""}`} key={item.gift_id}>
          <PrizeVisual prize={item}/>
          <b>{prizeName(item)}</b>
          <StarPrice value={value}/>
          <span className={`rarity ${isStarPrize(item)?starTier(starPrizeAmount(item)):rarityClass(gift?.rarity||"Обычный")}`}>{isStarPrize(item)?"Звёзды":gift?.rarity||"Подарок"}</span>
        </div>;
      })}
    </div>
  </div>;
}

function ShopScreen({items,search,setSearch,sort,setSort,rarity,setRarity,onGift}:{items:GiftItem[];search:string;setSearch:(v:string)=>void;sort:"asc"|"desc";setSort:(v:"asc"|"desc")=>void;rarity:string;setRarity:(v:string)=>void;onGift:(g:GiftItem)=>void}) {
  const rarities=["Все","Обычный","Необычный","Редкий","Эпический","Легендарный","Мифический"];
  return <div className="shop-page">
    <div className="page-title centered"><h1>Магазин подарков</h1><p>Подарки для вашей коллекции</p></div>
    <div className="shop-controls"><div className="search-box"><Search size={17}/><input aria-label="Поиск подарков" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти подарок"/></div><button className="sort-button" onClick={()=>setSort(sort==="asc"?"desc":"asc")}>{sort==="asc"?"Сначала дешевле":"Сначала дороже"} <ArrowDownUp size={15}/></button></div>
    <div className="rarity-filters">{rarities.map(r=><button key={r} aria-pressed={rarity===r} className={rarity===r?"chosen":""} onClick={()=>setRarity(r)}>{r}</button>)}</div>
    <div className="shop-grid">{items.map(g=><button className="shop-item" key={g.id} onClick={()=>onGift(g)}>
      <div className="shop-image-wrap"><GiftImage gift={g}/></div>
      <div className="shop-price"><CurrencyIcon/>{fmt(g.price_stars)}</div>
      <div className="shop-name">{g.name}</div>
    </button>)}</div>
    {items.length===0&&<div className="account-empty"><Search size={28}/><h3>Ничего не найдено</h3><p>Измените название или фильтр редкости.</p><button className="small-button" onClick={()=>{setSearch("");setRarity("Все");}}>Сбросить фильтры</button></div>}
    <div className="catalog-count">{items.length} из {gifts.length} подарков · цены каталога на 25.11.2026</div>
  </div>;
}

type DemoLeader = {
  id: string;
  name: string;
  amount: number;
  avatarUrl: string;
  gift: GiftItem;
};

// Локальные Pinterest-style аватары из референсов пользователя: аниме, животные и предметы.
// В наборе нет фотографий реальных лиц и внешних URL.
const demoLeaderAvatars = [
  "/assets/leader-avatars/anime-back.webp",
  "/assets/leader-avatars/anime-closeup-clean.webp",
  "/assets/leader-avatars/anime-red-white.webp",
  "/assets/leader-avatars/anime-side-grey.webp",
  "/assets/leader-avatars/anime-sketch.webp",
  "/assets/leader-avatars/anime-uniform.webp",
  "/assets/leader-avatars/bear-doodle.webp",
  "/assets/leader-avatars/black-anime.webp",
  "/assets/leader-avatars/blue-bird.webp",
  "/assets/leader-avatars/cream-puppy.webp",
  "/assets/leader-avatars/dark-anime.webp",
  "/assets/leader-avatars/night-car.webp",
  "/assets/leader-avatars/plush-bear.webp",
  "/assets/leader-avatars/puppy-carrot-close.webp",
  "/assets/leader-avatars/puppy-teddy.webp",
  "/assets/leader-avatars/red-anime-clean.webp",
  "/assets/leader-avatars/sakura-night.webp",
  "/assets/leader-avatars/skull-graphic.webp",
  "/assets/leader-avatars/sleepy-puppy.webp",
  "/assets/leader-avatars/two-kittens.webp",
  "/assets/leader-avatars/vampire-print.webp",
  "/assets/leader-avatars/white-puppy.webp",
  "/assets/leader-avatars/winged-bear.webp"
];

// Ники взяты из присланных пользователем скриншотов списка Telegram-пользователей.
// Состав перемешивается по расписанию демо-сезона; это не реальные данные рейтинга.
const demoLeaderNicknames = [
  "Darini’s", "pazl 🐼", "#Финансовый mercy ★", "кесарев", "данил панамеренко 🥲",
  "✌🏻✌🏻", "никулька", "#freemissed", "Zerokxq", "бивв печени", "flower", "#пафаси 🌙",
  "Ванек", "#usertye 🔹", "geroinov | #благословенный", "h🍭", "туалетный потрошитель",
  "коля", "Аполлон в руках нож", "Настя", "#John R 🦇", "Ewer ★", "t3!", "Nika1’s",
  "so many Rkits", "novelleirz", "Kimi Antonelli", "#westyrik / вестурик", "Mk =TOXIC",
  "BRACHO_LOVAKA", "Selber NFT", "'ryrx/zxcyk'", "qq", "Qw0nky😎", "лириков @llrlkov | 2%",
  "Lean 🐣", "курсаев", "VR Miller #898", "Verkhovniy | kaz1mir", "centaur", "Elena Brooks ❀ XD",
  "Vilon", "Эвелинка", "алинкааа❤️", "Yeasz", "Фригидный 🧊", "GHOST", "МАКСИМКААА",
  "Aeron", "Stretten", "ucigo ★", "#T", "TVOI_BRACHO", "Cvv", "Y", "поля", "Троянский",
  "босс", "glarad #3", "prince", "#SAGEX", "dime", "0D", "SON1K", "хайпожор", "Gift Relayer",
  "Данило", "nastenka", "TNZ1SPY", "Фartyк", "diya", "Neon1s", "Sor.Mr", "кровь",
  "#Wormzix | Enthusiast", "кроль", "#ravezzz", "лиззка", "GUALA • MM", "excellent",
  "Юлия Пиратинская", "@tsartixc", "nowting", "Freegit #mefov", "Arthas Menethil", "Reflex",
  "Богатый школьник", "kasprit#rdc", "Tonwieerov", "Ромчик Ромчик", "phantom🃏",
  "пидиди #freemissed", "dannyok", "@aujuX ^^", "стич scup", "Хейси", "холс будаев", "Вадим",
  "NFT BUYER not.exe", "MYA 🐻"
];

const demoExpensiveGifts = [...gifts]
  .filter(g => g.image)
  .sort((a,b) => b.price_stars-a.price_stars)
  .slice(0,18);

const DEMO_SEASON_ANCHOR = new Date(2026,10,23,0,0,0,0);
const DEMO_DAY_MS = 24*60*60*1000;
const DEMO_WEEK_MS = 7*DEMO_DAY_MS;
const DEMO_SEASON_MS = 14*DEMO_DAY_MS;

function makeSeededRandom(seed:number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T,>(items:T[], random:()=>number) {
  const result = [...items];
  for(let i=result.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

function getDemoLeaderboard(now:Date) {
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const daysFromAnchor = Math.floor((today.getTime()-DEMO_SEASON_ANCHOR.getTime())/DEMO_DAY_MS);
  const seasonIndex = Math.floor(daysFromAnchor/14);
  const seasonStart = new Date(DEMO_SEASON_ANCHOR.getTime()+seasonIndex*DEMO_SEASON_MS);
  const seasonDay = Math.max(0,Math.floor((today.getTime()-seasonStart.getTime())/DEMO_DAY_MS));
  const nextReset = new Date(seasonStart.getTime()+DEMO_SEASON_MS);

  // Demo roster rotates on Monday, Wednesday and Friday (three rotations per week).
  const monday = new Date(today);
  const weekday = (monday.getDay()+6)%7;
  monday.setDate(monday.getDate()-weekday);
  const weekIndex = Math.floor((monday.getTime()-DEMO_SEASON_ANCHOR.getTime())/DEMO_WEEK_MS);
  const rotationSlot = weekday<2?0:weekday<4?1:2;
  const rotationIndex = weekIndex*3+rotationSlot;

  const random = makeSeededRandom((seasonIndex+100)*10007+rotationIndex*313+71);
  const nicknames = seededShuffle(demoLeaderNicknames,random);
  const avatars = seededShuffle(demoLeaderAvatars,random);
  const prizes = seededShuffle(demoExpensiveGifts,random);

  // Сумма каждого участника растёт ежедневно, а ники/аватары/подарки меняются
  // вместе с ротацией состава по понедельникам, средам и пятницам.
  const leaders:DemoLeader[] = nicknames.map((name,index)=>{
    const base = 18000+Math.floor(random()*265000);
    const dailyGrowth = 900+Math.floor(random()*14500);
    return {
      id:`${rotationIndex}-${index}`,
      name,
      amount:base+seasonDay*dailyGrowth,
      avatarUrl:avatars[index%avatars.length],
      gift:prizes[index%prizes.length]
    };
  }).sort((a,b)=>b.amount-a.amount);

  return {leaders,seasonDay,nextReset,rotationIndex};
}

function LeadersScreen() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(new Date()),1000);
    return ()=>window.clearInterval(timer);
  },[]);

  const board=useMemo(()=>getDemoLeaderboard(now),[now]);
  const remaining=Math.max(0,board.nextReset.getTime()-now.getTime());
  const days=Math.floor(remaining/DEMO_DAY_MS);
  const hours=Math.floor((remaining%DEMO_DAY_MS)/3600000);
  const minutes=Math.floor((remaining%3600000)/60000);
  const seconds=Math.floor((remaining%60000)/1000);
  const featured=demoExpensiveGifts.slice(0,5);
  const bonus=demoExpensiveGifts.slice(5,8);
  return <div className="page-stack leaderboard-screen">
    <section className="leader-hero">
      <div className="leader-hero-gifts">
        {featured.map(g=><div className="leader-hero-gift" key={g.id}><GiftImage gift={g}/></div>)}
      </div>
      <h1>Лидеры</h1>
      <p>Рейтинг сезона · обновление каждые две недели</p>
      <div className="leader-countdown">
        <div><b>{days}</b><span>дни</span></div>
        <div><b>{String(hours).padStart(2,"0")}</b><span>часы</span></div>
        <div><b>{String(minutes).padStart(2,"0")}</b><span>минуты</span></div>
        <div><b>{String(seconds).padStart(2,"0")}</b><span>секунды</span></div>
      </div>
      <div className="leader-demo-label"><span className="leader-demo-dot"/> Демонстрационный рейтинг</div>
    </section>

    <section className="leader-bonus">
      <h2>Дополнительные призы</h2>
      <p>Примеры призов для участников топ-100</p>
      <div className="leader-bonus-grid">
        {bonus.map((g,i)=><div className="leader-bonus-item" key={g.id}>
          <div className="leader-bonus-image"><GiftImage gift={g}/></div>
          <b>{[5,10,35][i]}</b>
          <span>{g.name}</span>
        </div>)}
      </div>
    </section>

    <section className="leader-you">
      <div className="leader-you-rank">—</div>
      <div className="leader-avatar leader-you-avatar">
        <img src="/assets/leader-avatars/blue-bird.webp" alt=""/>
      </div>
      <div className="leader-usercopy">
        <b>Вы</b>
        <small>Личная позиция в деморейтинге недоступна</small>
      </div>
      <span className="leader-you-value">—</span>
    </section>

    <div className="leader-list-heading"><b>Таблица лидеров</b><span>100 участников · демо</span></div>
    <section className="leader-list">
      {board.leaders.map((u,i)=><div className="leader-row" key={u.id}>
        <span className="leader-rank">{i+1}</span>
        <div className="leader-avatar">
          <img src={u.avatarUrl} alt="" loading="lazy"/>
        </div>
        <div className="leader-usercopy">
          <b title={u.name}>{u.name}</b>
          <strong><CurrencyIcon/> {fmt(u.amount)}</strong>
        </div>
        <div className="leader-won-gift" title={`Демо-приз: ${u.gift.name}`} aria-label={`Выигранный подарок: ${u.gift.name}`}>
          <GiftImage gift={u.gift}/>
          <small>{u.gift.name}</small>
        </div>
      </div>)}
    </section>

    <div className="leader-demo-disclaimer">
      Участники, суммы и призы в этом рейтинге — демонстрационные.
    </div>
  </div>;
}

function ProfileScreen({name,photoUrl,inventory,onTopup,onWithdraw,onGift,onAdmin,isAdmin}:{name:string;photoUrl:string;inventory:OwnedGift[];onTopup:()=>void;onWithdraw:()=>void;onGift:(gift:GiftItem,uid:string)=>void;onAdmin:()=>void;isAdmin:boolean}) {
  const [photoFailed,setPhotoFailed]=useState(false);
  useEffect(()=>setPhotoFailed(false),[photoUrl]);
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  return <div className="reference-profile">
    <section className="reference-identity">
      <div className="reference-avatar">{photoUrl&&!photoFailed?<img src={photoUrl} alt={name} onError={()=>setPhotoFailed(true)}/>:<span>{initials}</span>}</div>
      <h1>{name}</h1>
    </section>
    <div className="reference-actions"><Button onClick={onTopup}>Пополнить</Button><Button kind="ghost" onClick={onWithdraw}>Вывести</Button></div>
    <section className={`reference-inventory ${inventory.length?"has-gifts":""}`} aria-label="Инвентарь">
      {inventory.length?<div className="reference-inventory-grid">{inventory.map(item=>{const gift=byId.get(item.giftId);return gift?<motion.button key={item.uid} className="reference-inventory-item" whileTap={{scale:.96}} onClick={()=>onGift(gift,item.uid)} aria-label={`${gift.name}, ${fmt(gift.price_stars)} звёзд`}><GiftImage gift={gift}/><b>{gift.name}</b><StarPrice value={gift.price_stars}/></motion.button>:null;})}</div>:<span className="reference-inventory-empty">Инвентарь пуст</span>}
    </section>
    {isAdmin&&<button className="text-action profile-admin" onClick={onAdmin}><Settings size={14}/>Админ-панель</button>}
  </div>;
}

function UpgradeScreen({inventory,initialUid,token,onBack,onRemove,onAdd,onToast,onBusy}:{inventory:OwnedGift[];initialUid:string;token:string;onBack:()=>void;onRemove:(uid:string)=>void;onAdd:(id:string,uid?:string)=>void;onToast:(s:string)=>void;onBusy:(busy:boolean)=>void}) {
  const [sourceUid,setSourceUid]=useState(initialUid||inventory[0]?.uid||"");
  const [targetId,setTargetId]=useState("");
  const [picker,setPicker]=useState<"source"|"target"|null>(null);
  const [spinning,setSpinning]=useState(false);
  const [wheelRotation,setWheelRotation]=useState(0);
  const reduced=useReducedMotion();
  const running=useRef(false);
  const animationDone=useRef<(()=>void)|null>(null);
  const [displayChance,setDisplayChance]=useState<number|null>(null);
  const [settled,setSettled]=useState<"success"|"failure"|null>(null);
  const [outcome,setOutcome]=useState<{success:boolean;source:GiftItem;target:GiftItem;chance:number}|null>(null);
  useEffect(()=>{if(initialUid){setSourceUid(initialUid);setTargetId("");}},[initialUid]);
  const source=inventory.find(x=>x.uid===sourceUid);
  const sourceGift=source?byId.get(source.giftId):undefined;
  const targets=gifts.filter(g=>!sourceGift||(g.id!==sourceGift.id&&g.price_stars>=sourceGift.price_stars)).sort((a,b)=>a.price_stars-b.price_stars);
  const target=targets.find(g=>g.id===targetId);
  const chance=sourceGift&&target?Math.min(95,sourceGift.price_stars/target.price_stars*100):0;
  const quickTarget=(mult:number)=>{
    if(!sourceGift)return;
    const next=targets.find(g=>g.price_stars>=sourceGift.price_stars*mult);
    if(next)setTargetId(next.id);else onToast("В каталоге нет цели с таким множителем");
  };
  const run=async()=>{
    if(!source||!sourceGift||!target){onToast("Выбери исходный и целевой подарок");return;}
    if(running.current)return;
    running.current=true;onBusy(true);setSpinning(true);setSettled(null);setOutcome(null);tap();
    try {
      let success:boolean;
      let finalChance=chance;
      let newInventoryId:string|undefined;
      if(token) {
        const result:any=await api("/api/upgrades",{inventory_id:Number(source.uid),target_gift_id:target.id});
        success=!!result.success;
        finalChance=result.chance;
        newInventoryId=result.inventory_id?String(result.inventory_id):undefined;
      } else {
        const roll=crypto.getRandomValues(new Uint32Array(1))[0]%10000;
        success=roll<Math.round(chance*100);
      }
      setDisplayChance(finalChance);
      const greenDegrees=Math.max(0,Math.min(360,finalChance*3.6));
      const stopDegrees=success?greenDegrees/2:greenDegrees+(360-greenDegrees)/2;
      const complete=new Promise<void>(resolve=>{animationDone.current=resolve;});
      setWheelRotation(current=>current+360*6+((stopDegrees-(current%360)+360)%360));
      await complete;
      setSettled(success?"success":"failure");
      await new Promise(resolve=>window.setTimeout(resolve,reduced?0:420));
      onRemove(source.uid);
      if(success)onAdd(target.id,newInventoryId);
      setOutcome({success,source:sourceGift,target,chance:finalChance});
      tap();
    } catch(e:any) {
      onToast("Апгрейд не выполнен: "+e.message);
    } finally {running.current=false;onBusy(false);setSpinning(false);setDisplayChance(null);}
  };
  const shownChance=displayChance??chance;
  const chanceLabel=shownChance>0&&shownChance<.01?"< 0,01":Number(shownChance.toFixed(2)).toLocaleString("ru-RU");
  return <div className="page-stack upgrade-page">
    <div className="page-title"><h1>Апгрейдер</h1><p>Выбери свой подарок и цель из каталога Telegram Gifts</p></div>
    <div className={`precision-wheel ${spinning?"is-spinning":""} ${settled?`is-${settled}`:""}`} aria-label={`Шанс улучшения ${chanceLabel}%`}>
      <svg className="precision-dial" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="145" fill="none" stroke="#ffffff08"/>
        {Array.from({length:60},(_,i)=><line key={i} x1="150" y1="10" x2="150" y2={i%5===0?19:15} transform={`rotate(${i*6} 150 150)`} stroke={i%5===0?"#747f90":"#38404b"} strokeWidth={i%5===0?1.5:1}/>)}
        <circle cx="150" cy="150" r="119" fill="none" stroke="#2a313b" strokeWidth="13"/>
        <motion.circle cx="150" cy="150" r="119" fill="none" stroke="#64d4b3" strokeWidth="13" pathLength="100" strokeDasharray="100" transform="rotate(-90 150 150)" animate={{strokeDashoffset:100-shownChance}} transition={{duration:.5,ease:[.22,1,.36,1]}}/>
        <circle cx="150" cy="150" r="100" fill="#1a1e24" stroke="#ffffff0a"/>
      </svg>
      <motion.div className="precision-rotor" animate={{rotate:wheelRotation}} transition={{duration:reduced?0:4.2,ease:[.12,.72,.12,1]}} onAnimationComplete={()=>{const done=animationDone.current;animationDone.current=null;done?.();}}><div className="precision-needle"/></motion.div>
      <div className="precision-center"><span>{spinning?"АПГРЕЙД":"ШАНС УСПЕХА"}</span><strong>{target?chanceLabel:"—"}<small>{target?"%":""}</small></strong><p>{settled?settled==="success"?"Готово":"Не в этот раз":spinning?"Улучшение подарка":sourceGift&&target?`×${(target.price_stars/sourceGift.price_stars).toFixed(2)}`:"Выберите подарки"}</p></div>
    </div>
    <div className="upgrade-legend"><span><i/>Успех</span><span><i/>Неудача</span></div>
    <div className="upgrade-picks">
      <button className="pick-card pick-card-button" disabled={spinning} onClick={()=>setPicker("source")}>
        <span>Твой подарок</span>
        {sourceGift?<><GiftImage gift={sourceGift}/><b>{sourceGift.name}</b><StarPrice value={sourceGift.price_stars}/></>:<div className="pick-empty"><Plus size={22}/><b>Выбрать</b></div>}
      </button>
      <ArrowRight className="pick-arrow"/>
      <button className="pick-card pick-card-button" disabled={spinning} onClick={()=>setPicker("target")}>
        <span>Хочу получить</span>
        {target?<><GiftImage gift={target}/><b>{target.name}</b><StarPrice value={target.price_stars}/></>:<div className="pick-empty"><Plus size={22}/><b>Выбрать цель</b></div>}
      </button>
    </div>
    <div className="upgrade-quick"><span>Быстрый выбор цели</span><div>{[2,3,4,10].map(x=><button key={x} disabled={!sourceGift||spinning} onClick={()=>quickTarget(x)}>x{x}</button>)}</div></div>
    <Button disabled={spinning||!sourceGift||!target} onClick={run}>{spinning?"Стрелка вращается…":"Улучшить подарок"}</Button>
    {!inventory.length&&<div className="empty-state"><Gift size={28}/><b>Инвентарь пуст</b><span>Сначала открой кейс или получи подарок в магазине</span></div>}
    <AnimatePresence>
      {picker && <Modal onClose={()=>setPicker(null)}>
        <div className="upgrade-picker">
          <div className="modal-heading">{picker==="source"?"Выбери свой подарок":"Выбери цель"}</div>
          <div className="upgrade-picker-grid">
            {(picker==="source"?inventory.map(x=>({uid:x.uid,gift:byId.get(x.giftId)})).filter(x=>x.gift).map(x=>({id:x.uid,gift:x.gift!})):
              targets.map(g=>({id:g.id,gift:g}))).map(({id,gift})=><button key={id} className={`upgrade-picker-item ${picker==="source"&&sourceUid===id||picker==="target"&&targetId===id?"selected":""}`} onClick={()=>{
                if(picker==="source"){setSourceUid(id);setTargetId("");}
                else setTargetId(id);
                setPicker(null);
              }}>
                <GiftImage gift={gift}/><b>{gift.name}</b><StarPrice value={gift.price_stars}/>
              </button>)}
          </div>
          {picker==="source"&&!inventory.length&&<div className="empty-state">В инвентаре пока нет подарков</div>}
        </div>
      </Modal>}
      {outcome && <Modal onClose={()=>setOutcome(null)}>
        <div className={`upgrade-result ${outcome.success?"success":"failure"}`}>
          {outcome.success&&<ConfettiBurst/>}
          {outcome.success?<CheckCircle2 size={48}/>:<XCircle size={48}/>}
          <h2>{outcome.success?"Апгрейд успешен!":"Подарок сгорел"}</h2>
          <div className="upgrade-result-gifts">
            <div><GiftImage gift={outcome.source}/><small>{outcome.source.name}</small></div>
            <ArrowRight/>
            <div className={!outcome.success?"burning-gift":""}>
              <GiftImage gift={outcome.success?outcome.target:outcome.source}/>
              <small>{outcome.success?outcome.target.name:"Подарок сгорел"}</small>
              {!outcome.success&&<span className="burning-embers">✦　·　✦　·　✦</span>}
            </div>
          </div>
          <p className={!outcome.success?"burning-caption":""}>{outcome.success?`Новый подарок добавлен в инвентарь · шанс ${Math.round(outcome.chance*100)/100}%`:`Шанс был ${Math.round(outcome.chance*100)/100}%. Исходный подарок сгорел.`}</p>
          <Button onClick={()=>setOutcome(null)}>Продолжить</Button>
        </div>
      </Modal>}
    </AnimatePresence>
  </div>;
}
function CrashScreen({balance,setBalance,token,onToast}:{balance:number;setBalance:React.Dispatch<React.SetStateAction<number>>;token:string;onToast:(s:string)=>void}) {
  const [bet,setBet]=useState(25);
  const [game,setGame]=useState<CrashState|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [betModalOpen,setBetModalOpen]=useState(false);
  const [autoCashout,setAutoCashout]=useState(false);
  const [autoCashoutAt,setAutoCashoutAt]=useState(1.5);
  const autoCashoutLock=useRef(false);
  const countdownVideoRef=useRef<HTMLVideoElement|null>(null);
  const flightVideoRef=useRef<HTMLVideoElement|null>(null);
  const explosionVideoRef=useRef<HTMLVideoElement|null>(null);
  const videoPhaseKeyRef=useRef("");
  const videoGenerationRef=useRef(0);
  const refresh=async()=>{
    if(!token)return;
    try {
      const state=await api<CrashState>("/api/crash/state");
      setGame(state);setBalance(state.balance);
    } catch(e:any) { onToast("Не удалось обновить состояние игры: "+e.message); }
    finally {setLoading(false);}
  };
  useEffect(()=>{
    if(!token){setLoading(false);return;}
    refresh();
    const id=window.setInterval(refresh,850);
    return()=>window.clearInterval(id);
  },[token]);
  useEffect(()=>{
    if(!game)return;
    const phaseKey=`${game.round_id}:${game.phase}`;
    if(videoPhaseKeyRef.current===phaseKey)return;
    videoPhaseKeyRef.current=phaseKey;
    const generation=++videoGenerationRef.current;
    const videos=[countdownVideoRef.current,flightVideoRef.current,explosionVideoRef.current];
    videos.forEach(video=>{
      if(!video)return;
      video.pause();
      try{video.currentTime=0;}catch{}
    });
    const playFrom=(video:HTMLVideoElement|null,seekTo:number,rate=1)=>{
      if(!video)return;
      const start=()=>{
        if(videoGenerationRef.current!==generation)return;
        const duration=Number.isFinite(video.duration)?video.duration:0;
        const safeEnd=duration>0?Math.max(0,duration-0.04):seekTo;
        const target=Math.min(safeEnd,Math.max(0,seekTo));
        video.playbackRate=rate;
        if(duration>0&&seekTo>=duration-0.04){
          video.currentTime=safeEnd;
          video.pause();
          return;
        }
        video.currentTime=target;
        const playing=video.play();
        if(playing&&typeof playing.catch==="function")playing.catch(()=>{});
      };
      if(video.readyState>=1)start();
      else video.addEventListener("loadedmetadata",start,{once:true});
    };
    if(game.phase==="betting"){
      const elapsed=Math.min(5,Math.max(0,Number(game.betting_elapsed??(5-game.countdown))));
      const countdownDuration=7.533333;
      playFrom(countdownVideoRef.current,elapsed/5*countdownDuration,countdownDuration/5);
    }else if(game.phase==="running"){
      const elapsed=Math.max(0,Math.log(Math.max(1,game.multiplier))/0.14);
      playFrom(flightVideoRef.current,elapsed,1);
    }else if(game.phase==="crashed"){
      playFrom(explosionVideoRef.current,Math.max(0,Number(game.crash_elapsed||0)),1);
    }
  },[game?.round_id,game?.phase]);
  const freezeVideo=(event:React.SyntheticEvent<HTMLVideoElement>)=>{
    const video=event.currentTarget;
    video.pause();
    if(Number.isFinite(video.duration)&&video.duration>0){
      try{video.currentTime=Math.max(0,video.duration-0.04);}catch{}
    }
  };
  const placeBet=async()=>{
    if(!token){onToast("Подключи Telegram-профиль, чтобы поставить ставку");return;}
    if(bet<25||bet>balance){onToast("Ставка минимум 25 ⭐ и не больше баланса");return;}
    setBusy(true);
    try {
      const result:any=await api("/api/crash/bet",{amount:bet});
      setBalance(result.balance);setBetModalOpen(false);await refresh();tap();
    } catch(e:any){onToast("Ставка не принята: "+e.message);}
    finally{setBusy(false);}
  };
  const cashout=async()=>{
    if(!token)return;
    setBusy(true);
    try {
      const result:any=await api("/api/crash/cashout",{});
      setBalance(result.balance);await refresh();
      onToast(`Забрал ${fmt(result.payout)} ⭐ · x${Number(result.multiplier).toFixed(2)}`);tap();
    } catch(e:any){onToast("Не удалось забрать ставку: "+e.message);await refresh();}
    finally{setBusy(false);}
  };
  const myBet=game?.my_bet;
  const canBet=!!game&&game.phase==="betting"&&!myBet;
  const canCashout=!!game&&game.phase==="running"&&myBet?.status==="pending";
  useEffect(()=>{
    if(!autoCashout||!canCashout||!game||game.multiplier<autoCashoutAt||autoCashoutLock.current)return;
    autoCashoutLock.current=true;
    cashout().finally(()=>{autoCashoutLock.current=false;setAutoCashout(false);});
  },[autoCashout,autoCashoutAt,game?.multiplier,game?.phase,myBet?.status]);
  return <div className="page-stack crash-page">
    <div className="page-title"><h1>Краш</h1><p>Забери выигрыш до того, как облако лопнет.</p></div>
    <div className={`crash-scene crash-scene-${game?.phase||"loading"}`}>
      <div className="crash-video-stage" aria-hidden="true">
        <video ref={countdownVideoRef} className={`crash-video ${game?.phase==="betting"?"is-active":""}`} src="/assets/crash-countdown.mp4" muted playsInline preload="auto" onEnded={freezeVideo}/>
        <video ref={flightVideoRef} className={`crash-video ${game?.phase==="running"?"is-active":""}`} src="/assets/crash-flight.mp4" muted playsInline preload="auto" onEnded={freezeVideo}/>
        <video ref={explosionVideoRef} className={`crash-video ${game?.phase==="crashed"?"is-active":""}`} src="/assets/crash-explosion.mp4" muted playsInline preload="auto" onEnded={freezeVideo}/>
      </div>
      {game&&game.phase!=="betting"&&<div className={`crash-mult ${game.phase==="crashed"?"crash-busted":""}`}>
        {game.phase==="crashed"?`КРАШ x${Number(game.crash_at||1).toFixed(2)}`:`x${game.multiplier.toFixed(2)}`}
      </div>}
      {loading&&!game&&<div className="crash-mult">Подключаемся…</div>}
      {!loading&&!game&&<div className="crash-mult">Игра недоступна</div>}
      <div className="crash-phase-label">{game?.phase==="betting"?"Приём ставок":game?.phase==="running"?"Самолёт в полёте":game?.phase==="crashed"?"Раунд завершён":"Ожидание"}</div>
      <div className="crash-history"><span>Раунд #{game?.round_id||"—"}</span><span>{game?.players.length||0} игроков</span></div>
    </div>
    <div className="crash-players-panel">
      <div className="crash-table-head"><b>Пользователь</b><b>Коэффициент</b></div>
      <AnimatePresence initial={false}>
        {game?.players.map(player=><motion.div className="crash-player-row" key={`${game.round_id}-${player.tg_id}`} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} layout>
          <div className="crash-player-avatar">{player.photo_url?<img src={player.photo_url} alt=""/>:(player.display_name||"И").replace("@","").slice(0,1).toUpperCase()}</div>
          <div className="crash-player-copy"><b>{player.display_name}</b><strong><CurrencyIcon/>{fmt(player.amount)}</strong></div>
          <div className={`crash-player-result ${player.status==="cashed"?"won":player.status==="lost"?"lost":""}`}>
            {player.status==="cashed"?<>x{Number(player.cashout_multiplier||1).toFixed(2)} <CheckCircle2 size={16}/></>:
             player.status==="lost"?<>x <XCircle size={16}/></>:
             game?.phase==="running"?`x${game.multiplier.toFixed(2)}`:"x1.00"}
          </div>
        </motion.div>)}
      </AnimatePresence>
      {(!game?.players||game.players.length===0)&&<div className="crash-no-players">Пока никто не поставил. Будь первым.</div>}
    </div>
    <div className="bet-panel crash-action-panel">
      <div className="crash-my-bet-summary"><span>Твоя ставка</span><strong><CurrencyIcon/>{fmt(myBet?.amount||bet)}</strong></div>
      {canCashout ? <Button disabled={busy} onClick={cashout}>Забрать x{game!.multiplier.toFixed(2)}</Button> :
       canBet ? <Button disabled={busy} onClick={()=>setBetModalOpen(true)}>Поставить ставку</Button> :
       <Button disabled onClick={()=>{}}>{myBet?.status==="cashed"?"Ставка забрана":myBet?.status==="lost"?"Ставка проиграна":game?.phase==="running"?"Приём ставок закрыт":game?.phase==="crashed"?"Следующий раунд скоро":"Ожидание игры"}</Button>}
      {myBet&&<div className={`my-bet-status ${myBet.status==="cashed"?"won":myBet.status==="lost"?"lost":""}`}>
        {myBet.status==="cashed"?`Ты забрал x${Number(myBet.cashout_multiplier||1).toFixed(2)}`:myBet.status==="lost"?"Ты не успел забрать ставку":"Твоя ставка участвует в раунде"}
      </div>}
    </div>
    {!token&&<div className="demo-disclaimer">Список участников и ставки появятся после подключения Telegram-профиля и Backend.</div>}
    <AnimatePresence>
      {betModalOpen&&<Modal onClose={()=>setBetModalOpen(false)}>
        <div className="crash-bet-modal">
          <div className="crash-bet-title">Новая ставка</div>
          <div className="crash-bet-amount"><input type="number" min="25" max={balance} value={bet} onChange={e=>setBet(Math.max(0,Number(e.target.value)||0))}/><CurrencyIcon/></div>
          <div className="quick-amounts crash-bet-quick">{[100,500,2500].map(x=><button key={x} onClick={()=>setBet(v=>Math.min(balance,v+x))}>+ {fmt(x)}</button>)}</div>
          <small className="crash-bet-min">Минимальная ставка — 25 ⭐</small>
          <label className="auto-cashout-row"><input type="checkbox" checked={autoCashout} onChange={e=>setAutoCashout(e.target.checked)}/><span>Авто-вывод</span><strong>x{autoCashoutAt.toFixed(2)}</strong></label>
          <div className="auto-cashout-slider"><input type="range" min="1.1" max="10" step="0.1" value={autoCashoutAt} disabled={!autoCashout} onChange={e=>setAutoCashoutAt(Number(e.target.value))}/></div>
          <Button kind="white" disabled={busy||bet<25||bet>balance} onClick={placeBet}>{busy?"Отправляем…":"Отправить ставку"}</Button>
        </div>
      </Modal>}
    </AnimatePresence>
  </div>;
}
function MinesScreen({balance,setBalance,token,onToast}:{balance:number;setBalance:React.Dispatch<React.SetStateAction<number>>;token:string;onToast:(s:string)=>void}) {
  const [size,setSize]=useState(5);
  const [mineCount,setMineCount]=useState(4);
  const [bet,setBet]=useState(100);
  const [started,setStarted]=useState(false);
  const [gameId,setGameId]=useState<number|null>(null);
  const [mineSet,setMineSet]=useState<number[]>([]);
  const [opened,setOpened]=useState<number[]>([]);
  const [lost,setLost]=useState(false);
  const [multiplier,setMultiplier]=useState(1);
  useEffect(()=>{
    if(!token)return;
    api<any>("/api/mines/active").then(({game})=>{
      if(game){
        setGameId(game.id);setSize(game.grid_size);setMineCount(game.mine_count);
        setBet(game.bet);setOpened(game.opened||[]);setMultiplier(game.multiplier||1);
        setStarted(true);setLost(false);
      }
    }).catch(()=>{});
  },[token]);
  const safe=opened.length;
  const start=async()=>{
    if(bet<25||bet>balance){onToast("Ставка минимум 25 ⭐ и не больше баланса");return;}
    if(token){
      try{
        const res:any=await api("/api/mines/start",{bet,grid_size:size,mine_count:mineCount});
        setGameId(res.game_id);setBalance(res.balance);setMineSet([]);setOpened([]);
        setMultiplier(1);setLost(false);setStarted(true);tap();
      }catch(e:any){onToast("Не удалось начать игру: "+e.message);}
      return;
    }
    setBalance(v=>v-bet);
    const total=size*size,arr=new Set<number>();
    while(arr.size<mineCount)arr.add(Math.floor(Math.random()*total));
    setMineSet([...arr]);setOpened([]);setMultiplier(1);setLost(false);setStarted(true);tap();
  };
  const reveal=async(i:number)=>{
    if(!started||opened.includes(i)||lost)return;
    if(token&&gameId){
      try{
        const res:any=await api(`/api/mines/${gameId}/reveal`,{cell_index:i});
        if(res.hit_mine){
          setLost(true);setStarted(false);setMineSet(res.mines||[]);setGameId(null);
          onToast("Попалась мина! Ставка потеряна.");
        } else {
          setOpened(res.opened||[]);setMultiplier(res.multiplier||1);tap();
        }
      }catch(e:any){onToast("Не удалось открыть клетку: "+e.message);}
      return;
    }
    if(mineSet.includes(i)){setLost(true);setStarted(false);onToast("Попалась мина! Ставка потеряна.");}
    else {setOpened(v=>[...v,i]);setMultiplier(Number((1+ (opened.length+1)*mineCount/(size*size-mineCount)*0.82).toFixed(2)));tap();}
  };
  const cashout=async()=>{
    if(!started||!opened.length)return;
    if(token&&gameId){
      try{
        const res:any=await api(`/api/mines/${gameId}/cashout`,{});
        setBalance(res.balance);setStarted(false);setGameId(null);
        onToast(`Забрал ${fmt(res.payout)} ⭐ · x${Number(res.multiplier).toFixed(2)}`);tap();
      }catch(e:any){onToast("Не удалось забрать выигрыш: "+e.message);}
      return;
    }
    const reward=Math.floor(bet*multiplier);setBalance(v=>v+reward);setStarted(false);onToast(`Забрал ${fmt(reward)} ⭐`);tap();
  };
  const reset=()=>{setStarted(false);setGameId(null);setOpened([]);setMineSet([]);setLost(false);setMultiplier(1);};
  return <div className="page-stack">
    <div className="page-title"><h1>Мины</h1><p>Открывай безопасные клетки и увеличивай множитель</p></div>
    <div className="mines-board" style={{gridTemplateColumns:`repeat(${size},1fr)`}}>
      {Array.from({length:size*size},(_,i)=><motion.button whileTap={{scale:.94}} key={i} className={`mine-cell ${opened.includes(i)?"safe":""} ${lost&&mineSet.includes(i)?"mine":""}`} onClick={()=>reveal(i)} disabled={!started||opened.includes(i)||lost}>
        {opened.includes(i)?<Gift size={20}/>:lost&&mineSet.includes(i)?<Bomb size={21}/>:<span>?</span>}
      </motion.button>)}
    </div>
    <div className="bet-panel">
      <div className="control-row"><b>Поле</b><div className="segmented">{[3,5,7].map(x=><button className={size===x?"active":""} onClick={()=>{if(!started){setSize(x);setMineCount(Math.max(4,Math.min(mineCount,x*x-1)));}}} key={x}>{x}×{x}</button>)}</div></div>
      <div className="control-row"><b>Количество мин</b><strong>{mineCount}</strong></div>
      <input className="range" type="range" min="4" max={size*size-1} value={mineCount} disabled={started} onChange={e=>setMineCount(Number(e.target.value))}/>
      <div className="control-row"><label>Ставка</label><strong>{bet} ⭐</strong></div>
      <input className="amount-input" type="number" min="25" value={bet} disabled={started} onChange={e=>setBet(Number(e.target.value))}/>
      <div className="mines-stats"><span>Безопасно: <b>{safe}</b></span><span>Множитель: <b>x{multiplier}</b></span></div>
      {!started?<Button onClick={lost?reset:start}>{lost?"Новая игра":"Начать игру"}</Button>:<Button onClick={cashout} disabled={!opened.length}>Забрать {fmt(bet*multiplier)} ⭐</Button>}
    </div>
    <div className="demo-disclaimer">Минимум 4 мины. Чем больше мин и открытых безопасных клеток, тем выше множитель. Результат проверяется сервером.</div>
  </div>;
}

function AdminScreen({onBack,token,onToast,ownId,onRefresh}:{onBack:()=>void;token:string;onToast:(s:string)=>void;ownId:string|number;onRefresh:()=>Promise<void>}) {
  const [tgId,setTgId]=useState("");
  const [adminBusy,setAdminBusy]=useState(false);
  const [amount,setAmount]=useState("1000");
  const [giftId,setGiftId]=useState(gifts[0]?.id||"");
  const [reason,setReason]=useState("");
  const [action,setAction]=useState("balance");
  const [query,setQuery]=useState("");
  const [found,setFound]=useState<any[]>([]);
  const [stats,setStats]=useState<any>(null);
  const [withdrawals,setWithdrawals]=useState<any[]>([]);
  const loadWithdrawals=async()=>{
    if(!token){onToast("Сначала подключи backend");return;}
    try{setWithdrawals(await api<any[]>("/api/admin/withdrawals",undefined,"GET"));}
    catch(e:any){onToast("Заявки: "+e.message);}
  };
  const updateWithdrawal=async(id:number,status:string)=>{
    try{await api(`/api/admin/withdrawals/${id}/status`,{status});await loadWithdrawals();onToast("Статус заявки обновлён");}
    catch(e:any){onToast("Не удалось обновить заявку: "+e.message);}
  };
  const searchUsers=async()=>{
    if(!token){onToast("Сначала подключи backend");return;}
    try{setFound(await api<any[]>(`/api/admin/users?q=${encodeURIComponent(query)}`,undefined,"GET"));}
    catch(e:any){onToast("Поиск: "+e.message);}
  };
  const loadStats=async()=>{
    if(!token){onToast("Сначала подключи backend");return;}
    try{setStats(await api<any>("/api/admin/stats",undefined,"GET"));}
    catch(e:any){onToast("Статистика: "+e.message);}
  };
  const doAction=async()=>{
    if(!token){onToast("Подключи backend и добавь свой Telegram ID в ADMIN_TG_IDS");return;}
    if(adminBusy)return;
    if(!/^\d+$/.test(tgId.trim())){onToast("Введите числовой Telegram ID");return;}
    if(action==="balance"&&(!Number.isSafeInteger(Number(amount))||!Number(amount))){onToast("Введите ненулевое целое число звёзд");return;}
    setAdminBusy(true);
    try {
      if(action==="balance")await api(`/api/admin/users/${tgId}/balance`,{amount:Number(amount),reason});
      if(action==="ban")await api(`/api/admin/users/${tgId}/ban`,{banned:true,reason});
      if(action==="unban")await api(`/api/admin/users/${tgId}/ban`,{banned:false,reason});
      if(action==="gift")await api(`/api/admin/users/${tgId}/gift`,{gift_id:giftId});
      onToast("Действие выполнено");setReason("");
      await onRefresh().catch(()=>onToast("Действие выполнено. Обновите профиль для загрузки баланса."));
    } catch(e:any){onToast("Ошибка: "+e.message);} finally {setAdminBusy(false);}
  };
  return <div className="page-stack">
    <div className="page-title"><h1>Админ-панель</h1><p>Управление пользователями и балансами</p></div>
    <div className="admin-warning"><Shield size={19}/> Доступ к действиям проверяется на сервере по Telegram ID администратора.</div>
    <div className="admin-form">
      <label>Поиск пользователя по Telegram ID или username</label>
      <div className="admin-search-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ID или username"/><button className="admin-search-btn" onClick={searchUsers}><Search size={17}/></button></div>
      {found.map(u=><button key={u.tg_id} className="admin-user-result" onClick={()=>setTgId(String(u.tg_id))}><span><b>{u.first_name||u.username||u.tg_id}</b><small>@{u.username||"без username"} · ID {u.tg_id}</small></span><strong>{fmt(u.balance)} ⭐</strong></button>)}
      <Button kind="ghost" onClick={loadStats}>Обновить статистику</Button>
      {stats&&<div className="admin-stats"><span>Пользователи <b>{stats.users}</b></span><span>Предметы <b>{stats.inventory_items}</b></span><span>Начислено <b>{fmt(stats.credited_stars)} ⭐</b></span><span>Списано <b>{fmt(stats.spent_stars)} ⭐</b></span></div>}
    </div>
    <div className="admin-form">
      <div className="section-row"><b>Заявки на вывод</b><button className="admin-search-btn" onClick={loadWithdrawals}><RotateCcw size={16}/></button></div>
      {withdrawals.map(w=><div className="admin-withdrawal" key={w.id}>
        <div><b>#{w.id} · {w.username?"@"+w.username:w.first_name||w.tg_id}</b><small>{w.asset_type==="stars"?`${fmt(w.amount||0)} ⭐`:(w.gift_name||"NFT-подарок")} · {prettyDate(w.submitted_at)}</small><small>Получатель: {w.destination}</small><small>Статус: {w.status}</small></div>
        <div className="admin-withdrawal-actions">
          <button onClick={()=>updateWithdrawal(w.id,"processing")}>В работу</button>
          <button onClick={()=>updateWithdrawal(w.id,"paid")}>Выполнено вручную</button>
          <button onClick={()=>updateWithdrawal(w.id,"rejected")}>Отклонить</button>
        </div>
      </div>)}
      {!withdrawals.length&&<span className="muted">Нажми обновить, чтобы загрузить заявки.</span>}
    </div>
    <div className="admin-form">
      <button className="admin-self" onClick={()=>setTgId(String(ownId))}>Подставить мой ID: {ownId}</button>
      <label>Telegram ID пользователя</label><input aria-label="Telegram ID пользователя" inputMode="numeric" value={tgId} onChange={e=>setTgId(e.target.value)} placeholder="Например 123456789"/>
      <label>Действие</label><select value={action} onChange={e=>setAction(e.target.value)}><option value="balance">Начислить / списать ⭐</option><option value="gift">Выдать NFT</option><option value="ban">Заблокировать</option><option value="unban">Разблокировать</option></select>
      {action==="balance"&&<><label>Сумма (положительная — выдать, отрицательная — списать)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></>}
      {action==="gift"&&<><label>Подарок</label><select value={giftId} onChange={e=>setGiftId(e.target.value)}>{gifts.map(g=><option key={g.id} value={g.id}>{g.name} · {g.price_stars} ⭐</option>)}</select></>}
      <label>Причина / комментарий</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Служебная заметка"/>
      <Button onClick={doAction} disabled={adminBusy}>{adminBusy?"Выполняем…":"Выполнить действие"}</Button>
    </div>
    <div className="demo-disclaimer">Все административные операции записываются в журнал. Не выдавай доступ по username — только по Telegram ID.</div>
  </div>;
}
