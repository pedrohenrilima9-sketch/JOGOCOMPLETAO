document.addEventListener("DOMContentLoaded", () => {
 const $ = id => document.getElementById(id);
 const status = $("status");
 let peer = null, host = false, roomCode = "", myName = "", hostConn = null, clientId = "";
 let connections = [], state = null, starting = false, hbInterval = null;

 const PEER_PREFIX = "lf-futebol-sala-";
 const peerConfig = {
  config: {
   iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
   ]
  }
 };

 function message(txt, error=false){status.textContent=txt;status.style.color=error?"#ffb4b4":"#bfe5ff";}
 function makeCode(){return String(Math.floor(100000+Math.random()*900000));}
 function cleanName(v){return (v||"").trim().slice(0,18);}

 $("codigoSala").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
 });

 function showRoom(){
  $("salaAtiva").classList.remove("escondido");
  $("codigoExibido").textContent=roomCode;
  $("avisoAnfitriao").textContent=host?"Você é o anfitrião. Compartilhe o código numérico acima e clique em Iniciar leilão quando todos entrarem.":"Conectado! Aguardando o anfitrião iniciar o leilão.";
  $("iniciarLeilao").classList.toggle("escondido",!host);
  renderPlayers();
 }

 function renderPlayers(){
  if(!state)return;
  $("listaParticipantes").innerHTML="";
  Object.values(state.players||{}).forEach(p=>{
   if(p.isBot) return;
   const li=document.createElement("li");
   li.textContent=p.name+(p.id==="host"?" • Anfitrião":"");
   $("listaParticipantes").appendChild(li);
  });
 }

 function saveLocal(){
  sessionStorage.setItem("lf-room",JSON.stringify({host,roomCode,myName,clientId,state}));
 }

 function clientKey(){return "guest-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);}

 function goAuction(){
  if(starting) return;
  starting = true;
  if(hbInterval) clearInterval(hbInterval);
  saveLocal();
  window.location.href = "leilao.html";
 }

 function broadcast(data){
  connections = connections.filter(c => c && c.open);
  connections.forEach(c => {
   try { c.send(data); } catch(e) {}
  });
 }

 function setupHost(){
  state={roomCode,players:{host:{id:"host",name:myName,budget:500000000,roster:[],lineup:{},formation:"4-3-3"}},auction:null,history:[],started:false,finished:false,paused:false,results:[]};
  peer=new Peer(PEER_PREFIX + roomCode, peerConfig);

  peer.on("open",()=>{
   message("Sala criada! Código numérico: " + roomCode);
   showRoom();
   saveLocal();
  });

  peer.on("connection",conn=>{
   connections.push(conn);

   const registerGuest = (data) => {
    const id = (data && data.clientId) || conn.peer;
    const humanCount = Object.values(state.players).filter(p=>!p.isBot).length;
    if(humanCount >= 16 && !state.players[id]){
     try{ conn.send({type:"error",message:"A sala já está cheia (máx. 16 jogadores)."}); }catch(e){}
     setTimeout(()=>conn.close(), 300);
     return;
    }
    state.players[id]={
     id,
     name:cleanName(data && data.name)||"Jogador",
     budget:500000000,
     roster:[],
     lineup:{},
     formation:"4-3-3"
    };
    conn.playerId=id;
    renderPlayers();
    saveLocal();
    const payload = state.started ? {type:"start",state} : {type:"state",state};
    broadcast(payload);
    try{ conn.send(payload); }catch(e){}
    message(state.players[id].name + " entrou na sala!");
   };

   conn.on("data",data=>{
    if(!data) return;
    if(data.type==="hello"){
     registerGuest(data);
    } else if(data.type==="ping"){
     const payload = state.started ? {type:"start",state} : {type:"state",state};
     try{ conn.send(payload); }catch(e){}
    }
   });

   conn.on("close",()=>{
    if(!starting && conn.playerId && state.players[conn.playerId]){
     delete state.players[conn.playerId];
     renderPlayers();
     saveLocal();
     broadcast({type:"state",state});
    }
   });
  });

  peer.on("error",err=>{
   if(err.type==="unavailable-id"){
    peer.destroy();
    roomCode = makeCode();
    setupHost();
   } else {
    message("Erro ao criar sala: "+err.type,true);
   }
  });
 }

 $("criarSala").addEventListener("click",()=>{
  if(peer)return;
  myName=cleanName($("nomeCriador").value);
  if(!myName){message("Digite seu nome antes de criar a sala.",true);return;}
  host=true;
  roomCode=makeCode();
  message("Criando sala...");
  setupHost();
 });

 $("entrarSala").addEventListener("click",()=>{
  if(peer)return;
  myName=cleanName($("nomeConvidado").value);
  roomCode=$("codigoSala").value.replace(/\D/g, "").trim();
  if(!myName || !/^\d{6}$/.test(roomCode)){
   message("Informe seu nome e os 6 números do código da sala.",true);
   return;
  }
  message("Conectando à sala " + roomCode + "...");
  clientId=clientKey();
  peer=new Peer(clientId, peerConfig);

  peer.on("open",()=>{
   let connected = false;
   hostConn=peer.connect(PEER_PREFIX + roomCode,{reliable:true});

   hostConn.on("open",()=>{
    connected = true;
    hostConn.send({type:"hello",name:myName,clientId});
    // Mantém sincronização ativa caso algum pacote atrase
    hbInterval = setInterval(()=>{
     if(hostConn && hostConn.open && !starting){
      try{ hostConn.send({type:"ping",clientId}); }catch(e){}
     }
    }, 1000);
   });

   hostConn.on("data",data=>{
    if(!data) return;
    if(data.type==="state"){
     state=data.state;
     host=false;
     showRoom();
     saveLocal();
     message("Conectado com sucesso à sala " + roomCode + "!");
     if(state && state.started){
      goAuction();
     }
    }
    if(data.type==="error"){
     message(data.message,true);
    }
    if(data.type==="start"){
     state=data.state;
     host=false;
     goAuction();
    }
   });

   hostConn.on("close",()=>{
    if(!starting) message("Conexão encerrada pelo anfitrião.",true);
   });

   setTimeout(()=>{
    if(!connected){
     message("Sala não encontrada ou demorando a responder. Verifique o código de 6 números.",true);
     if(peer){ peer.destroy(); peer=null; }
    }
   }, 8000);
  });

  peer.on("error",err=>{
   message("Não foi possível conectar ("+err.type+"). Verifique o número da sala.",true);
   if(peer){ peer.destroy(); peer=null; }
  });
 });

 $("copiarCodigo").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(roomCode);message("Código " + roomCode + " copiado!");}
  catch(e){message("Código da sala: "+roomCode);}
 });

 $("iniciarLeilao").addEventListener("click",()=>{
  if(!host||!state||starting)return;
  $("iniciarLeilao").disabled = true;
  $("iniciarLeilao").textContent = "Iniciando para todos...";
  state.started=true;
  saveLocal();
  // Envia o sinal de início múltiplas vezes antes de mudar a página do anfitrião para garantir que todos os convidados recebam
  broadcast({type:"start",state});
  setTimeout(()=>broadcast({type:"start",state}), 200);
  setTimeout(()=>broadcast({type:"start",state}), 450);
  setTimeout(goAuction, 800);
 });
});
