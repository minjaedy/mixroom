import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import webpush from 'web-push';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const vars=path.join(root,'.dev.vars');
try{await fs.access(vars);console.log('기존 .dev.vars를 유지합니다. 초기 코드는 .local/setup-code.txt를 확인하세요.');}
catch(error){
  if(error.code!=='ENOENT')throw error;
  const code=crypto.randomBytes(24).toString('hex');
  const hash=crypto.createHash('sha256').update(code).digest('hex');
  const keys=webpush.generateVAPIDKeys();
  await fs.mkdir(path.join(root,'.local'),{recursive:true});
  await fs.writeFile(vars,'SETUP_CODE_HASH='+hash+'\nVAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey+'\n',{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(root,'.local/setup-code.txt'),code+'\n',{flag:'wx',mode:0o600});
  console.log('로컬 초기 설정을 만들었습니다. .local/setup-code.txt를 사용해 관리자 계정을 등록하세요.');
}
