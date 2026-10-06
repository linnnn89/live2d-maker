export function projectPrefix(search = typeof location === 'undefined' ? '' : location.search): string {
  const id = new URLSearchParams(search).get('project');
  return id && /^[a-f0-9]{32}$/.test(id) ? '/projects/'+id : '';
}
export function assetUrl(relative:string):string {
  return projectPrefix()+'/studio-files/'+relative.split('/').map(encodeURIComponent).join('/');
}
