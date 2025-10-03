export default function HitCard({ hit, onClose }) {
  if (!hit) return null;
  const { title, body, media_url, cta_text, cta_url } = hit.place;
  return (
    <div style={{
      position:'fixed', left:16, right:16, bottom:16, zIndex:9999,
      background:'#111', color:'#fff', padding:16, borderRadius:12,
      boxShadow:'0 12px 30px rgba(0,0,0,.35)', maxWidth:420
    }}>
      {media_url && <img src={media_url} alt="" style={{width:'100%',borderRadius:8,marginBottom:10}} />}
      <h3 style={{margin:'0 0 6px 0'}}>{title}</h3>
      <p style={{margin:'0 0 10px 0',opacity:.9,lineHeight:1.4}}>{body}</p>
      <div style={{display:'flex',gap:8}}>
        {cta_url && (
          <a href={cta_url} target="_blank" rel="noreferrer"
             style={{background:'#4f8bfd',color:'#000',padding:'8px 12px',borderRadius:8,textDecoration:'none',fontWeight:600}}>
            {cta_text || 'Abrir'}
          </a>
        )}
        <button onClick={onClose} style={{marginLeft:'auto',background:'#222',color:'#fff',border:'1px solid #444',
          padding:'8px 12px',borderRadius:8,cursor:'pointer'}}>Cerrar</button>
      </div>
    </div>
  );
}
