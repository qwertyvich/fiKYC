export function analytics(
  db,
  {
    days = 7,
    productId = '',
    sessionId = '',
    from = '',
    to = '',
    timeZone = 'Europe/Moscow',
    eventPage = 1,
    sessionPage = 1,
  } = {},
) {
  days = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const offsetFor = (day) => {
    const offset =
      new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(day + 'T12:00:00Z'))
        .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  };
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? Date.parse(to + 'T23:59:59.999Z') - offsetFor(to)
    : Date.now();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from)
    ? Date.parse(from + 'T00:00:00Z') - offsetFor(from)
    : end - days * 86400000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end - start > 366 * 86400000
  )
    throw new Error('Период должен быть от 1 до 366 дней');
  const where =
    'at >= ? AND at <= ?' +
    (productId
      ? ' AND (product_id = ? OR EXISTS (SELECT 1 FROM json_each(events.product_ids) WHERE value = ?))'
      : '') +
    (sessionId ? ' AND session_id = ?' : '');
  const args = [
    start,
    end,
    ...(productId ? [productId, productId] : []),
    ...(sessionId ? [sessionId] : []),
  ];
  const rows = db.prepare(
      `SELECT id, type, product_id AS productId, session_id AS sessionId, visitor_id AS visitorId, at, duration_ms AS durationMs, quantity, link_id AS linkId, view_id AS viewId, product_ids AS productIds, country FROM events WHERE ${where} ORDER BY at`,
    )
    .iterate(...args);
  const counts=new Map(),visitors=new Set(),byView=new Map(),viewedSessions=new Set(),allCartSessions=new Set(),actionRows=[];
  let totalMs=0,units=0;
  const count=type=>counts.get(type)??0;
  const groups = new Map(),
    products = new Map(),
    sessions = new Map();
  // Resolve time-zone offsets at transitions, rather than calling Intl for every
  // heartbeat. Streaming keeps hundreds of thousands of timing rows out of memory.
  const offsetFormat=new Intl.DateTimeFormat('en',{timeZone,timeZoneName:'longOffset'});
  const offsetAt=ms=>{const part=offsetFormat.formatToParts(ms).find(p=>p.type==='timeZoneName')?.value??'GMT',m=part.match(/GMT([+-])(\d{2}):(\d{2})/);return m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]))*60000:0;};
  const offsets=[{at:start,offset:offsetAt(start)}];
  let sampled=start;
  for(let at=Math.min(start+21600000,end);sampled<end;at=Math.min(at+21600000,end)){
    const offset=offsetAt(at),previous=offsets.at(-1).offset;
    if(offset!==previous){let low=sampled,high=at;while(high-low>1){const mid=Math.floor((low+high)/2);if(offsetAt(mid)===previous)low=mid;else high=mid;}offsets.push({at:high,offset});}
    sampled=at;
  }
  const localDate=ms=>{let low=0,high=offsets.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(offsets[mid].at<=ms)low=mid;else high=mid-1;}return new Date(ms+offsets[low].offset);};
  const dayKey=ms=>localDate(ms).toISOString().slice(0,10);
  for (let at = start; at <= end; at += 86400000)
    groups.set(dayKey(at), { date: dayKey(at), views: 0, carts: 0, sessions: new Set() });
  if (!groups.has(dayKey(end)))
    groups.set(dayKey(end), { date: dayKey(end), views: 0, carts: 0, sessions: new Set() });
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0 }));
  for (const r of rows) {
    counts.set(r.type,count(r.type)+1);visitors.add(r.visitorId);
    if(r.type==='product_time'){totalMs+=r.durationMs;const key=r.visitorId+':'+r.sessionId+':'+r.viewId;byView.set(key,(byView.get(key)??0)+r.durationMs);}
    else actionRows.push({...r,productIds:JSON.parse(r.productIds)});
    if(r.type==='product_view')viewedSessions.add(r.sessionId);
    if(r.type==='cart_add'){allCartSessions.add(r.sessionId);units+=r.quantity;}
    const key = dayKey(r.at),
      day = groups.get(key) ?? { date: key, views: 0, carts: 0, sessions: new Set() };
    day.sessions.add(r.sessionId);
    if (r.type === 'product_view') day.views++;
    if (r.type === 'cart_add') day.carts++;
    groups.set(key, day);
    if (r.type !== 'product_time') hours[localDate(r.at).getUTCHours()].events++;
    if (r.productId) {
      const p = products.get(r.productId) ?? {
        productId: r.productId,
        views: 0,
        clicks: 0,
        cartAdds: 0,
        units: 0,
        activeMs: 0,
        visitors: new Set(),
        viewIds: new Set(),
      };
      p.visitors.add(r.visitorId);
      if (r.type === 'product_view') {
        p.views++;
        p.viewIds.add(r.viewId);
      }
      if (r.type === 'product_click') p.clicks++;
      if (r.type === 'cart_add') {
        p.cartAdds++;
        p.units += r.quantity;
      }
      if (r.type === 'product_time') p.activeMs += r.durationMs;
      products.set(r.productId, p);
    }
    const s = sessions.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      visitorId: r.visitorId,
      startedAt: r.at,
      lastAt: r.at,
      events: 0,
      views: 0,
      cartAdds: 0,
      activeMs: 0,
      country: '',
    };
    if(!s.country&&r.country)s.country=r.country;
    s.lastAt = r.at;
    if (r.type !== 'product_time') s.events++;
    if (r.type === 'product_view') s.views++;
    if (r.type === 'cart_add') s.cartAdds++;
    if (r.type === 'product_time') s.activeMs += r.durationMs;
    sessions.set(r.sessionId, s);
  }
  actionRows.reverse();
  const cartSessions=new Set([...allCartSessions].filter(id=>viewedSessions.has(id)));
  const sessionRows = [...sessions.values()].sort((a, b) => b.lastAt - a.lastAt);
  const countries=new Map();
  for(const session of sessionRows){const country=session.country||'',entry=countries.get(country)??{country,visitors:new Set(),sessions:0};entry.visitors.add(session.visitorId);entry.sessions++;countries.set(country,entry);}
  eventPage = Math.max(
    1,
    Math.min(
      Math.ceil(actionRows.length / 200) || 1,
      Number.isSafeInteger(Number(eventPage)) ? Number(eventPage) : 1,
    ),
  );
  sessionPage = Math.max(
    1,
    Math.min(
      Math.ceil(sessionRows.length / 100) || 1,
      Number.isSafeInteger(Number(sessionPage)) ? Number(sessionPage) : 1,
    ),
  );
  return {
    pagination: {
      eventPage,
      eventPages: Math.ceil(actionRows.length / 200) || 1,
      sessionPage,
      sessionPages: Math.ceil(sessionRows.length / 100) || 1,
      totalSessions: sessionRows.length,
    },
    period: { start, end, timeZone },
    summary: {
      visitors: visitors.size,
      sessions: sessions.size,
      views: count('product_view'),
      clicks: count('product_click'),
      cartAdds: count('cart_add'),
      units,
      checkoutViews: count('checkout_view'),
      sellerOpens: count('seller_open'),
      requests: count('request_submit'),
      averageSeconds: count('product_view') ? totalMs / count('product_view') / 1000 : 0,
      conversion: viewedSessions.size ? (cartSessions.size / viewedSessions.size) * 100 : 0,
    },
    daily: [...groups.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, sessions: d.sessions.size })),
    hours,
    countries:[...countries.values()].map(c=>({country:c.country,visitors:c.visitors.size,sessions:c.sessions,share:sessionRows.length?c.sessions/sessionRows.length*100:0})).sort((a,b)=>b.sessions-a.sessions||a.country.localeCompare(b.country)),
    products: [...products.values()]
      .map((p) => ({
        ...p,
        visitors: p.visitors.size,
        viewIds: undefined,
        averageSeconds: p.views ? p.activeMs / p.views / 1000 : 0,
      }))
      .sort((a, b) => b.views - a.views),
    sessions: sessionRows.slice((sessionPage - 1) * 100, sessionPage * 100),
    events: actionRows
      .slice((eventPage - 1) * 200, eventPage * 200)
      .map((r) => ({
        ...r,
        activeSeconds:
          r.type === 'product_view'
            ? (byView.get(r.visitorId + ':' + r.sessionId + ':' + r.viewId) ?? 0) / 1000
            : 0,
      })),
    totalEvents: actionRows.length,
  };
}
