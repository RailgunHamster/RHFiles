// Shared, bounded presentation model for desktop and Android release notes.
const releaseHistoryPages = Object.freeze({
  size:10,
  split(entries,page=1){
    const records=Array.isArray(entries)?entries:[];
    const totalOlder=Math.max(0,records.length-10),pages=Math.max(1,Math.ceil(totalOlder/10));
    page=Math.min(pages,Math.max(1,Number.isFinite(page)?Math.trunc(page):1));
    const offset=10+(page-1)*10;
    return {recent:records.slice(0,10),older:records.slice(offset,offset+10),page,pages,pageSize:10,offset,total:records.length,totalOlder};
  }
});
