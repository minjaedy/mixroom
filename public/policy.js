export const AUDIO_CAPACITY=1024*1024*1024;
export const RETENTION_DAYS=30;
export const RETENTION_MS=RETENTION_DAYS*86400000;
export function expiryLabel(file){
  const at=file.expires_at??file.created_at+RETENTION_MS;
  return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(at)+' 자동 삭제';
}
export const retentionNotice='<div class="retention-notice"><strong>음원은 30일 동안 보관돼요</strong><p>각 파일은 업로드 완료 후 30일이 지나면 자동 삭제돼요. 재생·다운로드·작업 완료로 기한이 연장되지 않아요. 필요한 원본과 최종본은 기한 전에 다운로드해 별도로 보관하세요. 삭제 후 앱에서 복구할 수 없어요.</p></div>';
