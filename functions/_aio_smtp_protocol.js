/* AIO SMTP protocol — UTF-8 encoded text, implicit TLS, AUTH LOGIN.
 * Transport supplied by the Cloudflare sockets adapter; no secrets are logged.
 */
const encoder = new TextEncoder();
function base64(text){
  const bytes=encoder.encode(text);
  let binary='';for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}
function validEmail(v){return typeof v==='string'&&v.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(v);}
function failure(code){const e=new Error(code);e.code=code;return e;}
export async function smtpSend({connect,from,to,password,subject,text}){
  if(!validEmail(from)||!validEmail(to)||!password||typeof connect!=='function')throw failure('SMTP_CONFIG');
  if(typeof text!=='string'||text.length>10000||/\r|\n/.test(subject)||typeof subject!=='string')throw failure('SMTP_MESSAGE');
  let socket, reader, writer, timeout;
  let data='';const decoder=new TextDecoder();
  try{
    socket=connect({hostname:'smtp.wp.pl',port:465},{secureTransport:'on'});
    timeout=setTimeout(()=>{try{socket.close();}catch(_){}},18000);
    await socket.opened;
    reader=socket.readable.getReader(); writer=socket.writable.getWriter();
    async function nextLine(){
      for(;;){
        const index=data.indexOf('\n');
        if(index>=0){const line=data.slice(0,index).replace(/\r$/,'');data=data.slice(index+1);return line;}
        if(data.length>65536)throw failure('SMTP_INVALID_RESPONSE');
        const next=await reader.read();
        if(next.done)throw failure('SMTP_CONNECTION_CLOSED');
        data+=decoder.decode(next.value,{stream:true});
      }
    }
    async function receive(accepted){
      let code=null;let multi=0;
      for(;;){
        if(++multi>80)throw failure('SMTP_INVALID_RESPONSE');
        const line=await nextLine();
        const match=/^(\d{3})([ -])/.exec(line);
        if(!match)throw failure('SMTP_INVALID_RESPONSE');
        const n=Number(match[1]);
        if(code!==null&&n!==code)throw failure('SMTP_INVALID_RESPONSE');
        code=n;
        if(match[2]===' '){
          if(!accepted.includes(n)){
            // A code is useful diagnostically, but never leak the SMTP response line.
            throw failure(n===535?'SMTP_AUTH_REJECTED':`SMTP_REJECTED_${n}`);
          }
          return n;
        }
      }
    }
    async function command(line,codes){
      await writer.write(encoder.encode(line+'\r\n'));
      return receive(codes);
    }
    await receive([220]);
    await command('EHLO aio-iptv-projekt.pages.dev',[250]);
    await command('AUTH LOGIN',[334]);
    await command(base64(from),[334]);
    await command(base64(password),[235]);
    await command(`MAIL FROM:<${from}>`,[250]);
    await command(`RCPT TO:<${to}>`,[250,251]);
    await command('DATA',[354]);
    const head=[
      `From: AIO TunerHub <${from}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${base64(subject)}?=`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      'Auto-Submitted: auto-generated',
      'X-Auto-Response-Suppress: All',
    ].join('\r\n');
    const encoded=base64(text).match(/.{1,76}/g)?.join('\r\n')||'';
    await command(`${head}\r\n\r\n${encoded}\r\n.`,[250]);
    await command('QUIT',[221]);
    return {accepted:true};
  }catch(error){
    if(error?.code&&String(error.code).startsWith('SMTP_'))throw error;
    throw failure('SMTP_CONNECTION_FAILED');
  }finally{
    if(timeout)clearTimeout(timeout);
    try{reader?.releaseLock();}catch(_){}
    try{writer?.releaseLock();}catch(_){}
    try{await socket?.close();}catch(_){}
  }
}
