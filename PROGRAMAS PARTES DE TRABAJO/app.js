(() => {
  const USERS = {
    admin: { password: 'Con0101*', displayName: 'admin' },
    aaron: { password: '6032', displayName: 'aaron' },
  };

  const state = {
    username: localStorage.getItem('pt_user') || '',
    obras: [],
    partes: [],
    currentParteId: null,
    parteModalMode: 'new',
    lineaModalMode: 'new',
    editingLineaId: null,
    supabase: null,
  };

  const $ = (id) => document.getElementById(id);

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  function pad(n, len = 2) { return String(n).padStart(len, '0'); }
  function isoToDMY(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  function normalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim(); }
  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  function showMsg(target, text, ok = false) {
    target.textContent = text;
    target.className = `msg${ok ? ' success' : ''}`;
    target.classList.remove('hidden');
  }
  function hideMsg(target) {
    target.classList.add('hidden');
    target.textContent = '';
  }
  function openBackdrop(id) { $(id).classList.add('show'); }
  function closeBackdrop(id) { $(id).classList.remove('show'); }

  function setAuthMode(isLogged) {
    $('authScreen').classList.toggle('hidden', isLogged);
    $('appWrap').classList.toggle('hidden', !isLogged);
    if (isLogged) {
      $('currentUserBadge').textContent = `👤 Usuario: ${state.username}`;
      $('saveInfoNote').innerHTML = `✔️ Sesión actual: <strong>${state.username}</strong>.<br>✔️ Primero creas el parte. Después, dentro del parte, añades las líneas.<br>✔️ El Excel se descargará como <strong>${state.username}_PARTES_MM_AAAA.xlsx</strong>.`;
    }
  }

  function setMonthYearSelectors() {
    $('fMonth').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${pad(i+1)}">${pad(i+1)}</option>`).join('');
    const y = new Date().getFullYear();
    const years = [];
    for (let i = y - 2; i <= y + 2; i++) years.push(i);
    $('fYear').innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
    $('fMonth').value = pad(new Date().getMonth() + 1);
    $('fYear').value = String(y);
  }

  const comboState = { activeId: null };

  function getFilteredObras(query) {
    const q = normalize(query);
    const arr = q ? state.obras.filter(obra => normalize(obra).includes(q)) : [...state.obras];
    return arr.slice(0, 150);
  }

  function closeAllCombos(exceptId = null) {
    ['parteObra','lineaObra'].forEach(id => {
      if (id === exceptId) return;
      const menu = $(id + 'Menu');
      if (menu) menu.classList.add('hidden');
    });
    comboState.activeId = exceptId;
  }

  function renderObrasSelect(id, selected = '') {
    const input = $(id);
    if (!input) return;
    input.value = selected || '';
    renderComboMenu(id, input.value);
  }

  function renderComboMenu(id, query = '') {
    const menu = $(id + 'Menu');
    if (!menu) return;
    const items = getFilteredObras(query);
    if (!items.length) {
      menu.innerHTML = '<div class="comboEmpty">No se encontraron obras</div>';
      return;
    }
    menu.innerHTML = items.map(obra => `<div class="comboItem" data-combo-select="${id}">${escapeHtml(obra)}</div>`).join('');
    menu.querySelectorAll('[data-combo-select]').forEach(el => {
      el.addEventListener('click', () => {
        $(id).value = el.textContent;
        menu.classList.add('hidden');
      });
    });
  }

  function bindCombo(id) {
    const input = $(id);
    const menu = $(id + 'Menu');
    if (!input || !menu) return;
    input.addEventListener('focus', () => {
      closeAllCombos(id);
      renderComboMenu(id, input.value);
      menu.classList.remove('hidden');
    });
    input.addEventListener('click', () => {
      closeAllCombos(id);
      renderComboMenu(id, input.value);
      menu.classList.remove('hidden');
    });
    input.addEventListener('input', () => {
      closeAllCombos(id);
      renderComboMenu(id, input.value);
      menu.classList.remove('hidden');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.classList.add('hidden');
    });
  }


  function calcHours(start, end) {
    if (!start || !end) return '';
    const [sh, sm] = String(start).split(':').map(Number);
    const [eh, em] = String(end).split(':').map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return '';
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    return (Math.round((mins / 60) * 100) / 100).toFixed(2);
  }

  function refreshLineaUnidades() {
    const val = calcHours($('lineaHoraInicio').value, $('lineaHoraFin').value);
    $('lineaUnidades').value = val;
  }

  function mapTipoHoraExcel(tipo) {
    const t = String(tipo || '').trim().toUpperCase();
    if (t === 'ORDINARIA') return 'HNT';
    if (t === 'EXTRAORDINARIA') return 'HENT';
    return 'HEFT';
  }

  function splitObra(obra) {
    const raw = String(obra || '').trim();
    if (!raw) return { codigo: '', nombre: '' };
    const m = raw.match(/^([^\s]+)\s+(.*)$/);
    if (!m) return { codigo: raw, nombre: raw };
    return { codigo: m[1].trim(), nombre: m[2].trim() || m[1].trim() };
  }

  async function loadObras() {
    const res = await fetch('./importador_obras.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar importador_obras.json');
    state.obras = await res.json();
    renderObrasSelect('parteObra');
    renderObrasSelect('lineaObra');
  }

  function currentPart() {
    return state.partes.find(p => p.id === state.currentParteId) || null;
  }

  function generateCodigo() {
    const yy = String(new Date().getFullYear()).slice(-2);
    const max = state.partes.reduce((acc, p) => {
      const m = String(p.codigo || '').match(/PREC\d{2}\/0*(\d+)/i);
      return Math.max(acc, m ? Number(m[1]) : 0);
    }, 0);
    return `PREC${yy}/${String(max + 1).padStart(5, '0')}`;
  }
  function defaultResumen(fecha) {
    return `PM ${isoToDMY(fecha)} ${state.username}`;
  }

  function getPeriodBounds() {
    const month = $('fMonth').value;
    const year = $('fYear').value;
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = new Date(Number(year), Number(month), 0);
    const end = `${year}-${String(month).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
    return { month, year, start, end };
  }

  async function loadParts() {
    hideMsg($('appMsg'));
    const { start, end } = getPeriodBounds();
    const { data, error } = await state.supabase
      .from('partes')
      .select('id, username, codigo, fecha, estado, comentarios, resumen, obra_parte, created_at, partes_lineas(id, fecha, hora_inicio, hora_fin, unidades, tipo_hora, obra, texto, documento_nombre)')
      .eq('username', state.username)
      .gte('fecha', start)
      .lte('fecha', end)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'No se pudieron cargar los partes');
    state.partes = data || [];
    renderPartes();
    if (state.currentParteId) {
      const still = currentPart();
      if (still) showDetailView(still.id, true);
      else showListView();
    }
  }

  function filteredPartes() {
    const q = normalize($('txtSearch').value);
    return state.partes.filter(p => {
      if (!q) return true;
      const hay = [p.codigo, p.username, p.fecha, p.resumen, p.comentarios, p.estado, p.obra_parte].join(' ');
      return normalize(hay).includes(q);
    });
  }

  function renderPartes() {
    const parts = filteredPartes();
    $('listMeta').textContent = `Mostrando: ${parts.length}/${state.partes.length}`;
    $('emptyList').classList.toggle('hidden', parts.length !== 0);
    const tb = $('tbodyPartes');
    tb.innerHTML = '';
    parts.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="linkBtn" data-open="${p.id}">${escapeHtml(p.codigo)} · ${escapeHtml(p.resumen || defaultResumen(p.fecha))}</a></td>
        <td>${escapeHtml(p.username)}</td>
        <td>${escapeHtml(isoToDMY(p.fecha))}</td>
        <td><button class="badge badge-btn" data-toggle-state="${p.id}">${escapeHtml(p.estado || 'En elaboración')}</button></td>
        <td style="text-align:center;"><button class="btn btn-danger btn-small" data-del="${p.id}">🗑️</button></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-open]').forEach(elm => elm.addEventListener('click', () => showDetailView(elm.dataset.open)));
    tb.querySelectorAll('[data-toggle-state]').forEach(elm => elm.addEventListener('click', () => toggleParteEstado(elm.dataset.toggleState)));
    tb.querySelectorAll('[data-del]').forEach(elm => elm.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este parte?')) return;
      try {
        const { error } = await state.supabase.from('partes').delete().eq('id', elm.dataset.del).eq('username', state.username);
        if (error) throw error;
        if (state.currentParteId === elm.dataset.del) state.currentParteId = null;
        await loadParts();
        showMsg($('appMsg'), 'Parte eliminado correctamente.', true);
      } catch (e) {
        showMsg($('appMsg'), e.message || 'No se pudo eliminar.');
      }
    }));
  }

  function filteredLineas(lines) {
    const q = normalize($('txtSearchLineas').value);
    return lines.filter(l => {
      if (!q) return true;
      const hay = [l.obra, l.tipo_hora, l.unidades, l.fecha, l.hora_inicio, l.hora_fin, l.texto, l.documento_nombre].join(' ');
      return normalize(hay).includes(q);
    });
  }

  function renderLineas(part) {
    const lines = filteredLineas(part.partes_lineas || []);
    $('lineasMeta').textContent = `Mostrando: ${lines.length}/${(part.partes_lineas || []).length}`;
    $('emptyLineas').classList.toggle('hidden', lines.length !== 0);
    const tb = $('tbodyLineas');
    tb.innerHTML = '';
    lines.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(l.obra)}</strong><br><span class="muted">${escapeHtml(l.texto)}</span></td>
        <td>${escapeHtml(l.tipo_hora)}</td>
        <td>${escapeHtml(String(l.unidades))}</td>
        <td>${escapeHtml(isoToDMY(l.fecha))}</td>
        <td style="text-align:center;"><button class="btn btn-ghost btn-small" data-edit-line="${l.id || ''}">✏️</button></td>
        <td style="text-align:center;"><button class="btn btn-danger btn-small" data-del-line="${l.id || ''}">🗑️</button></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-edit-line]').forEach(btn => btn.addEventListener('click', () => openLineaModal(btn.dataset.editLine)));
    tb.querySelectorAll('[data-del-line]').forEach(btn => btn.addEventListener('click', () => deleteLinea(btn.dataset.delLine)));
  }

  function showListView() {
    state.currentParteId = null;
    $('pageTitle').textContent = 'MIS PARTES DE TRABAJO';
    $('viewList').classList.remove('hidden');
    $('viewDetail').classList.add('hidden');
    renderPartes();
  }

  function showDetailView(parteId, keepSearch = false) {
    state.currentParteId = parteId;
    const part = currentPart();
    if (!part) return showListView();
    $('pageTitle').textContent = `${part.codigo} · ${part.resumen || defaultResumen(part.fecha)}`;
    $('detailHeader').textContent = `${part.codigo} · ${part.resumen || defaultResumen(part.fecha)}`;
    $('detailEstado').textContent = part.estado || 'En elaboración';
    $('detailEstado').dataset.parteId = part.id;
    $('detailAutor').textContent = part.username;
    $('detailObraParte').textContent = part.obra_parte || '-';
    $('detailComentario').textContent = part.comentarios || '-';
    $('viewList').classList.add('hidden');
    $('viewDetail').classList.remove('hidden');
    if (!keepSearch) $('txtSearchLineas').value = '';
    renderLineas(part);
  }

  function resetParteModal() {
    $('parteFecha').value = todayISO();
    $('parteResumen').value = defaultResumen(todayISO());
    $('parteComentario').value = '';
    renderObrasSelect('parteObra');
  }

  function openParteModal(mode = 'new') {
    state.parteModalMode = mode;
    if (mode === 'new') {
      $('modalParteTitle').textContent = 'NUEVO PARTE DE TRABAJO';
      resetParteModal();
    } else {
      const part = currentPart();
      if (!part) return;
      $('modalParteTitle').textContent = 'EDITAR PARTE DE TRABAJO';
      $('parteFecha').value = part.fecha;
      $('parteResumen').value = part.resumen || defaultResumen(part.fecha);
      $('parteComentario').value = part.comentarios || '';
      renderObrasSelect('parteObra', part.obra_parte || '');
    }
    openBackdrop('modalParte');
  }

  function closeParteModal() { closeBackdrop('modalParte'); }

  function resetLineaModal() {
    const p = currentPart();
    $('lineaFecha').value = p?.fecha || todayISO();
    $('lineaUnidades').value = '';
    $('lineaTipoHora').value = 'ORDINARIA';
    $('lineaHoraInicio').value = '';
    $('lineaHoraFin').value = '';
    $('lineaTexto').value = '';
    $('lineaAdjunto').value = '';
    renderObrasSelect('lineaObra', p?.obra_parte || '');
  }

  function openLineaModal(lineId = null) {
    const part = currentPart();
    if (!part) return showMsg($('appMsg'), 'Primero abre un parte.');
    state.lineaModalMode = lineId ? 'edit' : 'new';
    state.editingLineaId = lineId;
    $('modalLineaTitle').textContent = lineId ? 'EDITAR LÍNEA' : 'NUEVA LÍNEA';
    if (!lineId) {
      resetLineaModal();
    } else {
      const line = (part.partes_lineas || []).find(x => String(x.id) === String(lineId));
      if (!line) return;
      $('lineaFecha').value = line.fecha || part.fecha || todayISO();
      $('lineaUnidades').value = line.unidades ?? '';
      $('lineaTipoHora').value = line.tipo_hora || '';
      $('lineaHoraInicio').value = line.hora_inicio || '';
      $('lineaHoraFin').value = line.hora_fin || '';
      $('lineaTexto').value = line.texto || '';
      $('lineaAdjunto').value = '';
      renderObrasSelect('lineaObra', line.obra || '');
    }
    refreshLineaUnidades();
    openBackdrop('modalLinea');
  }

  function closeLineaModal() { closeBackdrop('modalLinea'); }

  function lineDraft() {
    const file = $('lineaAdjunto').files?.[0];
    return {
      id: state.lineaModalMode === 'edit' ? state.editingLineaId : null,
      fecha: $('lineaFecha').value,
      unidades: Number($('lineaUnidades').value || 0),
      tipo_hora: $('lineaTipoHora').value.trim(),
      hora_inicio: $('lineaHoraInicio').value || null,
      hora_fin: $('lineaHoraFin').value || null,
      obra: $('lineaObra').value.trim(),
      texto: $('lineaTexto').value.trim(),
      documento_nombre: file?.name || null,
    };
  }

  function validateLine(line) {
    if (!line.fecha) return 'La fecha de la línea es obligatoria.';
    if (!line.hora_inicio || !line.hora_fin) return 'La hora inicio y la hora fin son obligatorias.';
    if (!line.unidades || Number(line.unidades) <= 0) return 'Las unidades/horas deben ser mayores que 0.';
    if (!line.tipo_hora) return 'Selecciona un tipo de hora.';
    if (!line.obra) return 'Selecciona una obra.';
    if (!line.texto) return 'Escribe el texto de la línea.';
    return '';
  }

  async function savePartMeta() {
    hideMsg($('appMsg'));
    const fecha = $('parteFecha').value;
    if (!fecha) return showMsg($('appMsg'), 'La fecha del parte es obligatoria.');
    const part = currentPart();
    const payload = {
      username: state.username,
      codigo: part?.codigo || generateCodigo(),
      fecha,
      estado: part?.estado || 'En elaboración',
      resumen: $('parteResumen').value.trim() || defaultResumen(fecha),
      comentarios: $('parteComentario').value.trim() || null,
      obra_parte: $('parteObra').value.trim() || null,
    };

    try {
      if (part?.id) {
        const { error } = await state.supabase.from('partes').update(payload).eq('id', part.id).eq('username', state.username);
        if (error) throw error;
      } else {
        const { data, error } = await state.supabase.from('partes').insert(payload).select('id').single();
        if (error) throw error;
        state.currentParteId = data.id;
      }
      closeParteModal();
      await loadParts();
      const updated = state.partes.find(p => p.codigo === payload.codigo) || state.partes[0];
      if (updated) showDetailView(updated.id);
      showMsg($('appMsg'), state.parteModalMode === 'new' ? 'Parte creado correctamente.' : 'Parte actualizado correctamente.', true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo guardar el parte.');
    }
  }

  async function saveLinea() {
    hideMsg($('appMsg'));
    const part = currentPart();
    if (!part) return showMsg($('appMsg'), 'No hay parte seleccionado.');
    const draft = lineDraft();
    const validation = validateLine(draft);
    if (validation) return showMsg($('appMsg'), validation);

    const payload = {
      parte_id: part.id,
      username: state.username,
      fecha: draft.fecha,
      hora_inicio: draft.hora_inicio,
      hora_fin: draft.hora_fin,
      unidades: draft.unidades,
      tipo_hora: draft.tipo_hora,
      obra: draft.obra,
      texto: draft.texto,
      documento_nombre: draft.documento_nombre,
    };

    try {
      if (draft.id) {
        const { error } = await state.supabase.from('partes_lineas').update(payload).eq('id', draft.id).eq('username', state.username);
        if (error) throw error;
      } else {
        const { error } = await state.supabase.from('partes_lineas').insert(payload);
        if (error) throw error;
      }
      closeLineaModal();
      const currentId = part.id;
      await loadParts();
      showDetailView(currentId, true);
      showMsg($('appMsg'), state.lineaModalMode === 'new' ? 'Línea guardada correctamente.' : 'Línea actualizada correctamente.', true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo guardar la línea.');
    }
  }

  async function deleteLinea(lineId) {
    if (!confirm('¿Eliminar esta línea?')) return;
    try {
      const { error } = await state.supabase.from('partes_lineas').delete().eq('id', lineId).eq('username', state.username);
      if (error) throw error;
      const currentId = state.currentParteId;
      await loadParts();
      showDetailView(currentId, true);
      showMsg($('appMsg'), 'Línea eliminada correctamente.', true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo eliminar la línea.');
    }
  }

  async function toggleParteEstado(parteId) {
    const part = state.partes.find(p => p.id === parteId);
    if (!part) return;
    const actual = part.estado || 'En elaboración';
    const nuevo = actual === 'Terminado' ? 'En elaboración' : 'Terminado';
    const ok = confirm(`¿Cambiar el estado de "${part.codigo}" a "${nuevo}"?`);
    if (!ok) return;
    try {
      const { error } = await state.supabase
        .from('partes')
        .update({ estado: nuevo })
        .eq('id', parteId)
        .eq('username', state.username);
      if (error) throw error;
      const currentId = state.currentParteId;
      await loadParts();
      if (currentId === parteId) showDetailView(parteId, true);
      showMsg($('appMsg'), `Parte marcado como ${nuevo}.`, true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo cambiar el estado del parte.');
    }
  }

  async function deleteVisibleMonth() {
    const parts = [...state.partes];
    if (!parts.length) return showMsg($('appMsg'), 'No hay partes en el mes visible.');
    if (!confirm(`¿Eliminar ${parts.length} parte(s) del mes visible?`)) return;
    try {
      const ids = parts.map(p => p.id);
      const { error } = await state.supabase.from('partes').delete().in('id', ids).eq('username', state.username);
      if (error) throw error;
      state.currentParteId = null;
      await loadParts();
      showListView();
      showMsg($('appMsg'), 'Partes del mes visible eliminados.', true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo eliminar el mes visible.');
    }
  }

  async function downloadExcel() {
    hideMsg($('appMsg'));
    try {
      const { month, year, start, end } = getPeriodBounds();
      const { data, error } = await state.supabase
        .from('partes_lineas')
        .select('id, fecha, hora_inicio, hora_fin, unidades, tipo_hora, obra, texto, documento_nombre, partes!inner(codigo, username, resumen)')
        .eq('username', state.username)
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: true });
      if (error) throw error;

      const rows = (data || []).map(item => {
        const obraInfo = splitObra(item.obra || '');
        const precio = '';
        const total = '';
        return {
          'Fecha': item.fecha ? isoToDMY(item.fecha) : '',
          'Tipo Hora': mapTipoHoraExcel(item.tipo_hora),
          'Unidades': Number(item.unidades || 0),
          'Precio': precio,
          'Total': total,
          'Obra': obraInfo.codigo,
          'Nombre obra': obraInfo.nombre,
          'Partida': 'CIMOMI21',
          'Descripción partida': '',
          'Texto': item.texto || '',
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Fecha': '', 'Tipo Hora': '', 'Unidades': '', 'Precio': '', 'Total': '', 'Obra': '', 'Nombre obra': '', 'Partida': '', 'Descripción partida': '', 'Texto': 'Sin datos en el periodo seleccionado' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Partes');
      XLSX.writeFile(wb, `${state.username}_PARTES_${month}_${year}.xlsx`);
      showMsg($('appMsg'), `Excel generado correctamente para ${month}/${year}.`, true);
    } catch (e) {
      showMsg($('appMsg'), e.message || 'No se pudo descargar el Excel.');
    }
  }

  function doLogin(ev) {
    ev.preventDefault();
    hideMsg($('loginMsg'));
    const username = $('loginUser').value.trim().toLowerCase();
    const password = $('loginPass').value;
    const user = USERS[username];
    if (!user || user.password !== password) {
      return showMsg($('loginMsg'), 'Usuario o contraseña incorrectos.');
    }
    state.username = username;
    localStorage.setItem('pt_user', username);
    setAuthMode(true);
    loadParts().catch(e => showMsg($('appMsg'), e.message || 'No se pudieron cargar los partes.'));
  }

  function logout() {
    state.username = '';
    state.partes = [];
    state.currentParteId = null;
    localStorage.removeItem('pt_user');
    $('loginPass').value = '';
    setAuthMode(false);
  }

  function bind() {
    $('loginForm').addEventListener('submit', doLogin);
    $('btnLogout').addEventListener('click', logout);
    $('btnNewParte').addEventListener('click', () => openParteModal('new'));
    $('btnEditarParte').addEventListener('click', () => openParteModal('edit'));
    $('btnGuardarParte').addEventListener('click', savePartMeta);
    $('btnCancelarParte').addEventListener('click', closeParteModal);
    $('btnCloseParte').addEventListener('click', closeParteModal);
    $('btnNuevaLinea').addEventListener('click', () => openLineaModal());
    $('btnGrabarLinea').addEventListener('click', saveLinea);
    $('btnCancelarLinea').addEventListener('click', closeLineaModal);
    $('btnCloseLinea').addEventListener('click', closeLineaModal);
    $('btnHome').addEventListener('click', showListView);
    $('btnRefresh').addEventListener('click', () => loadParts().then(() => showMsg($('appMsg'), 'Listado actualizado.', true)).catch(e => showMsg($('appMsg'), e.message)));
    $('btnSearch').addEventListener('click', renderPartes);
    $('txtSearch').addEventListener('input', renderPartes);
    $('btnSearchLineas').addEventListener('click', () => { const p = currentPart(); if (p) renderLineas(p); });
    $('txtSearchLineas').addEventListener('input', () => { const p = currentPart(); if (p) renderLineas(p); });
    $('lineaHoraInicio').addEventListener('input', refreshLineaUnidades);
    $('lineaHoraFin').addEventListener('input', refreshLineaUnidades);
    $('fMonth').addEventListener('change', () => loadParts().catch(e => showMsg($('appMsg'), e.message)));
    $('fYear').addEventListener('change', () => loadParts().catch(e => showMsg($('appMsg'), e.message)));
    $('btnDownloadExcel').addEventListener('click', downloadExcel);
    $('detailEstado').addEventListener('click', () => { const id = $('detailEstado').dataset.parteId; if (id) toggleParteEstado(id); });
    $('parteFecha').addEventListener('change', () => {
      if (!$('parteResumen').value.trim()) $('parteResumen').value = defaultResumen($('parteFecha').value);
    });
  }

  function initSupabase() {
    const cfg = window.PT_CONFIG || {};
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('PEGA_AQUI') || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes('PEGA_AQUI')) {
      throw new Error('Configura config.js con tu SUPABASE_URL y tu Publishable key antes de usar la app.');
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('No se pudo cargar la librería de Supabase.');
    }
    state.supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  async function bootstrap() {
    setMonthYearSelectors();
    bindCombo('parteObra');
    bindCombo('lineaObra');
    bind();
    try {
      initSupabase();
      await loadObras();
    } catch (e) {
      showMsg($('loginMsg'), e.message || 'No se pudo iniciar la aplicación.');
      return;
    }

    if (state.username) {
      setAuthMode(true);
      try {
        await loadParts();
      } catch (e) {
        showMsg($('appMsg'), e.message || 'No se pudieron cargar los partes.');
      }
    } else {
      setAuthMode(false);
    }
  }

  document.addEventListener('click', (e) => {
    const insideParte = e.target.closest('#parteObra') || e.target.closest('#parteObraMenu');
    const insideLinea = e.target.closest('#lineaObra') || e.target.closest('#lineaObraMenu');
    if (!insideParte && !insideLinea) closeAllCombos();
  });

  bootstrap();
})();
