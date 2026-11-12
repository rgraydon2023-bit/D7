type Zip = { file(path:string, content:string):Zip; generateAsync(options:{type:'blob';mimeType:string}):Promise<Blob> };
type ZipConstructor = new()=>Zip;
async function loadZip():Promise<ZipConstructor>{
 const win=window as unknown as {JSZip?:ZipConstructor};
 if(win.JSZip)return win.JSZip;
 await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/jszip.min.js';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Could not load Excel export.'));document.head.appendChild(script);});
 if(!win.JSZip)throw new Error('Could not load Excel export.');return win.JSZip;
}
const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
export async function exportRulesExcel(root:HTMLElement,name:string){
 const rows:string[][]=[];const headingStyles=new Map<number,number>();const columnHeaderRows=new Set<number>();
 const heading=(text:string,style=2)=>{headingStyles.set(rows.length,style);rows.push([text,'']);};
 heading(root.querySelector('#generated-rules-export > div')?.textContent?.trim()||('Generated rules and results — '+name));
 root.querySelectorAll(':scope > section').forEach(section=>{
  heading(section.querySelector('h3')?.textContent?.trim()||'',3);
  section.querySelectorAll('h4').forEach(heading=>{
   headingStyles.set(rows.length,4);rows.push([heading.textContent?.trim()||'','']);columnHeaderRows.add(rows.length);rows.push(['Rule title','Explanation']);
   heading.nextElementSibling?.querySelectorAll('tbody tr').forEach(row=>rows.push([row.querySelector('th')?.textContent?.trim()||'',row.querySelector('td')?.textContent?.trim()||'']));
   rows.push(['','']);
  });
 });
 const Zip=await loadZip(),zip=new Zip();
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 zip.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rules" sheetId="1" r:id="rId1"/></sheets></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 zip.file('xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFD6AD4F"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF43A9CF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF71BEDA"/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>');
 const cells=rows.map((row,i)=>{const height=Math.max(18,Math.ceil(row[0].length/20)*18,Math.ceil(row[1].length/55)*18);return '<row r="'+(i+1)+'" ht="'+height+'" customHeight="1">'+row.map((v,j)=>'<c r="'+(j?'B':'A')+(i+1)+'" s="'+(columnHeaderRows.has(i)?5:j===0?(headingStyles.get(i)??1):1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>';}).join('');
 zip.file('xl/worksheets/sheet1.xml','<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="90" customWidth="1"/></cols><sheetData>'+cells+'</sheetData></worksheet>');
 const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'-rules.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

