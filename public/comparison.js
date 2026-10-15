export function comparisonSelection(versions){
  const revision=versions.find(v=>v.uploaded_by!=='client');
  const compare=!!revision&&versions.length>1;
  return compare?{compare,a:versions.find(v=>v.id!==revision.id).id,b:revision.id}:{compare,a:versions[0]?.id,b:versions[0]?.id};
}
