// ============================================================
//  CONTROLADOR DE PEDIDOS — Famat
//  Comparte datos con Pedidos Famat via Supabase + localStorage
// ============================================================

const STORAGE_KEY = 'famat_pedidos';
const PENDIENTES_KEY = 'famat_pendientes';
const SYNC_INTERVAL_MS = 15000;

let filtroActual  = 'todos';
let busqueda      = '';
let syncEnCurso   = false;

function formatearEtiquetaPago(metodoPago) {
    if (!metodoPago) return 'Sin especificar';
    return metodoPago === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia';
}

function formatearTelefonoDisplay(telefono) {
    if (!telefono) return 'Sin teléfono';
    return telefono.trim();
}

function normalizarTelefonoWA(telefono) {
    if (!telefono) return '';
    let num = telefono.replace(/\D/g, '');
    if (num.startsWith('0')) num = num.slice(1);
    if (num.startsWith('15') && num.length >= 12) num = '549' + num.slice(2);
    else if (!num.startsWith('54')) num = '54' + num;
    return num;
}

function construirMensajePedidoListo(p) {
    let msg = `*¡Hola ${p.cliente}!*\n\n`;
    msg += `*✅ Tu pedido de Famat ya está listo.*\n\n*Detalle:*\n`;

    if (p.productos && p.productos.length > 0) {
        p.productos.forEach(x => {
            const qty = (x.kilos !== null && x.kilos > 0) ? `${x.kilos} kg` : `x${x.cantidad}`;
            msg += `• ${x.nombre} (${qty})\n`;
        });
    }

    if (p.liquidos && p.liquidos.length > 0) {
        p.liquidos.forEach(l => { msg += `• ${l.nombre} — ${l.litros} L\n`; });
    }

    if (p.granel && p.granel.length > 0) {
        p.granel.forEach(g => { msg += `• ${g.nombre} — ${g.kilos} kg\n`; });
    }

    msg += `\n*Fecha de entrega:* ${p.entrega || 'A coordinar'}`;
    if (p.metodoPago) {
        msg += `\n*Pago:* ${p.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}`;
    }
    if (p.notas) msg += `\n*Notas:* ${p.notas}`;
    msg += '\n\n_Cualquier consulta, respondé este mensaje._\n_Famat Limpieza_';
    return msg;
}

function construirMensajePedidoPreparacion(p) {
    let msg = `*¡Hola ${p.cliente}!*\n\n`;
    msg += `*⚙️ Tu pedido de Famat ya está en preparación.*\n\n*Detalle:*\n`;

    if (p.productos && p.productos.length > 0) {
        p.productos.forEach(x => {
            const qty = (x.kilos !== null && x.kilos > 0) ? `${x.kilos} kg` : `x${x.cantidad}`;
            msg += `• ${x.nombre} (${qty})\n`;
        });
    }

    if (p.liquidos && p.liquidos.length > 0) {
        p.liquidos.forEach(l => { msg += `• ${l.nombre} — ${l.litros} L\n`; });
    }

    if (p.granel && p.granel.length > 0) {
        p.granel.forEach(g => { msg += `• ${g.nombre} — ${g.kilos} kg\n`; });
    }

    msg += `\n*Fecha de entrega:* ${p.entrega || 'A coordinar'}`;
    if (p.metodoPago) {
        msg += `\n*Pago:* ${p.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}`;
    }
    if (p.notas) msg += `\n*Notas:* ${p.notas}`;
    msg += '\n\n_Te avisamos cuando esté listo para retirar._\n_Famat Limpieza_';
    return msg;
}

function enviarWAListo(id) {
    const p = cargarPedidos().find(x => x.id === id);
    if (!p) return;
    if (p.estado !== 'listo') {
        alert('Solo podés avisar por WhatsApp cuando el pedido está marcado como *Listo*.');
        return;
    }

    const msg = construirMensajePedidoListo(p);
    const tel = normalizarTelefonoWA(p.telefono);
    const url = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

function enviarWAPreparacion(id) {
    const p = cargarPedidos().find(x => x.id === id);
    if (!p) return;
    if (p.estado !== 'en_preparacion') {
        alert('Solo podés avisar por WhatsApp cuando el pedido está marcado como *En preparación*.');
        return;
    }

    const msg = construirMensajePedidoPreparacion(p);
    const tel = normalizarTelefonoWA(p.telefono);
    const url = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

// ── CRUD localStorage (respaldo local) ────────────────────────
function cargarPedidosLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

function guardarPedidosLocal(lista) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lista)); }
    catch { alert('No se pudo guardar. Revisá el almacenamiento del navegador.'); }
}

function cargarPedidosPendientesLocal() {
    try { return JSON.parse(localStorage.getItem(PENDIENTES_KEY)) || []; }
    catch { return []; }
}

function guardarPedidosPendientesLocal(lista) {
    try { localStorage.setItem(PENDIENTES_KEY, JSON.stringify(lista)); }
    catch { alert('No se pudo guardar. Revisá el almacenamiento del navegador.'); }
}

function cargarPedidos() {
    return cargarPedidosLocal();
}

function guardarPedidos(lista) {
    guardarPedidosLocal(lista);
}

function cargarPedidosPendientes() {
    return cargarPedidosPendientesLocal();
}

function guardarPedidosPendientes(lista) {
    guardarPedidosPendientesLocal(lista);
}

// ── Sincronización Supabase ───────────────────────────────────
async function sincronizarDesdeSupabase() {
    if (syncEnCurso) return;
    syncEnCurso = true;

    try {
        initSupabaseFamat();
        const remoto = await obtenerPedidosSupabase();

        if (remoto.error) {
            console.warn('Sync Supabase:', remoto.error);
            mostrarEstadoSync('Sin conexión a Supabase: ' + remoto.error, true);
            renderizar();
            return;
        }

        const hayRemotos = remoto.pedidos.length > 0 || remoto.pendientes.length > 0;
        if (hayRemotos) {
            guardarPedidosLocal(remoto.pedidos);
            guardarPedidosPendientesLocal(remoto.pendientes);
            mostrarEstadoSync(`Sincronizado: ${remoto.pendientes.length} por confirmar, ${remoto.pedidos.length} activos`, false);
        } else {
            mostrarEstadoSync('Supabase conectado — aún no hay pedidos cargados', true);
        }

        renderizar();
    } finally {
        syncEnCurso = false;
    }
}

function mostrarEstadoSync(mensaje, esAviso) {
    const el = document.getElementById('estadoSync');
    if (!el) return;
    el.textContent = mensaje;
    el.className = 'estado-sync' + (esAviso ? ' estado-sync--aviso' : ' estado-sync--ok');
}

async function confirmarPedido(id) {
    const pendientes = cargarPedidosPendientes();
    const pedido = pendientes.find(p => p.id === id);
    if (!pedido) return;
    
    pedido.estado = 'pendiente';
    const pedidosFinal = cargarPedidos();
    pedidosFinal.push(pedido);
    guardarPedidos(pedidosFinal);
    guardarPedidosPendientes(pendientes.filter(p => p.id !== id));

    await actualizarPedidoSupabase(id, { estado: 'pendiente' });
    renderizar();
}

async function rechazarPedido(id) {
    if (!confirm('¿Rechazar este pedido?')) return;
    const pendientes = cargarPedidosPendientes();
    guardarPedidosPendientes(pendientes.filter(p => p.id !== id));
    await eliminarPedidoSupabase(id);
    renderizar();
}

async function actualizarEstado(id, nuevoEstado) {
    const lista = cargarPedidos().map(p => p.id === id ? {...p, estado: nuevoEstado} : p);
    guardarPedidos(lista);
    await actualizarPedidoSupabase(id, { estado: nuevoEstado });
    renderizar();
}

async function eliminarPedido(id) {
    if (!confirm('¿Eliminár este pedido del sistema?')) return;
    guardarPedidos(cargarPedidos().filter(p => p.id !== id));
    document.getElementById('modal').classList.remove('modal--visible');
    await eliminarPedidoSupabase(id);
    renderizar();
}

async function limpiarEntregados() {
    const lista = cargarPedidos();
    const entregados = lista.filter(p => p.estado === 'entregado');
    if (entregados.length === 0) { alert('No hay pedidos entregados para limpiar.'); return; }
    if (!confirm(`¿Eliminar los ${entregados.length} pedido(s) marcados como entregados?`)) return;

    guardarPedidos(lista.filter(p => p.estado !== 'entregado'));
    for (const p of entregados) {
        await eliminarPedidoSupabase(p.id);
    }
    renderizar();
}

// ── Filtros y búsqueda ─────────────────────────────────────────
function filtrar(estado, btn) {
    filtroActual = estado;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const titulos = {
        todos:          'Todos los pedidos',
        pendiente:      'Pedidos pendientes',
        en_preparacion: 'En preparación',
        listo:          'Listos para entregar',
        entregado:      'Entregados'
    };
    document.getElementById('tituloFiltro').textContent = titulos[estado];
    renderizar();
}

document.getElementById('buscador').addEventListener('input', function () {
    busqueda = this.value.toLowerCase().trim();
    renderizar();
});

// ── Renderizado principal ──────────────────────────────────────
function renderizar() {
    const todos   = cargarPedidos();
    const pendientes = cargarPedidosPendientes();
    actualizarBadges(todos);

    const contenedor = document.getElementById('listaCards');
    let html = '';

    // Mostrar pedidos pendientes de confirmación si hay
    if (pendientes.length > 0) {
        html += '<div style="margin-bottom: 30px;"><h3 style="color: #f5a623; margin-bottom: 15px;">⏳ PEDIDOS PENDIENTES DE CONFIRMACIÓN</h3>';
        pendientes.forEach(p => {
            const totalItems = (p.productos?.length || 0) + (p.liquidos?.length || 0) + (p.granel?.length || 0);
            html += `
            <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; font-size: 1.1em; color: #333;">${p.cliente}</div>
                    <div style="font-size: 0.9em; color: #666; margin-top: 5px;">📅 Entrega: <strong>${p.entrega || 'No especificada'}</strong></div>
                    <div style="font-size: 0.85em; color: #666; margin-top: 3px;">${formatearEtiquetaPago(p.metodoPago)}${p.telefono ? ` · 📱 ${formatearTelefonoDisplay(p.telefono)}` : ''}</div>
                    <div style="font-size: 0.85em; color: #999; margin-top: 3px;">${totalItems} ítem${totalItems !== 1 ? 's' : ''}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="confirmarPedido(${p.id})" style="background: #28a745; color: white; padding: 8px 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">✓ Confirmar</button>
                    <button onclick="rechazarPedido(${p.id})" style="background: #dc3545; color: white; padding: 8px 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">✕ Rechazar</button>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    // Luego mostrar los pedidos confirmados
    let lista = filtroActual === 'todos'
        ? todos
        : todos.filter(p => p.estado === filtroActual);

    if (busqueda) {
        lista = lista.filter(p => p.cliente.toLowerCase().includes(busqueda));
    }

    // Ordenar: primero por estado (pendiente > en_preparacion > listo > entregado), luego por fecha entrega
    const orden = { pendiente: 0, en_preparacion: 1, listo: 2, entregado: 3 };
    lista.sort((a, b) => (orden[a.estado] ?? 4) - (orden[b.estado] ?? 4) || a.id - b.id);

    if (lista.length === 0 && pendientes.length === 0) {
        contenedor.innerHTML = `<div class="mensaje-vacio"><span>🗂️</span>No hay pedidos en esta categoría.</div>`;
        return;
    }

    html += lista.map(p => cardHTML(p)).join('');
    contenedor.innerHTML = html;
}

function actualizarBadges(todos) {
    const conteos = { todos: todos.length, pendiente: 0, en_preparacion: 0, listo: 0, entregado: 0 };
    todos.forEach(p => { if (conteos[p.estado] !== undefined) conteos[p.estado]++; });
    Object.entries(conteos).forEach(([k, v]) => {
        const el = document.getElementById(`badge-${k}`);
        if (el) el.textContent = v;
    });
}

function cardHTML(p) {
    const totalItems = (p.productos?.length || 0) + (p.liquidos?.length || 0) + (p.granel?.length || 0);
    const resumen = [
        ...(p.productos || []).slice(0, 2).map(x => x.nombre),
        ...(p.liquidos  || []).slice(0, 1).map(x => x.nombre),
        ...(p.granel    || []).slice(0, 1).map(x => x.nombre)
    ].join(' · ') + (totalItems > 3 ? ` · +${totalItems - 3} más` : '');

    const etiquetaEstado = {
        pendiente:      '🕐 Pendiente',
        en_preparacion: '⚙️ En preparación',
        listo:          '✅ Listo',
        entregado:      '🚚 Entregado'
    };

    let btnWA = '';
    if (p.estado === 'listo') {
        btnWA = `<button class="card__btn-wa" onclick="event.stopPropagation(); enviarWAListo(${p.id})" title="Avisar al cliente que el pedido está listo">
            📱 ${p.telefono ? formatearTelefonoDisplay(p.telefono) : 'Avisar'}
           </button>`;
    } else if (p.estado === 'en_preparacion') {
        btnWA = `<button class="card__btn-wa card__btn-wa--prep" onclick="event.stopPropagation(); enviarWAPreparacion(${p.id})" title="Avisar al cliente que el pedido está en preparación">
            📱 ${p.telefono ? formatearTelefonoDisplay(p.telefono) : 'Avisar'}
           </button>`;
    }

    return `
    <div class="card" data-estado="${p.estado}" onclick="abrirModal(${p.id})">
        <div class="card__estado-dot estado--${p.estado}"></div>
        <div class="card__info">
            <div class="card__cliente">${p.cliente}</div>
            <div class="card__meta">
                <span>📅 Entrega: <strong>${p.entrega}</strong></span>
                <span>🕓 Recibido: ${p.fechaCreacion}</span>
                <span>🔢 ${totalItems} ítem${totalItems !== 1 ? 's' : ''}</span>
                <span>${formatearEtiquetaPago(p.metodoPago)}</span>
                ${p.telefono ? `<span>📱 ${formatearTelefonoDisplay(p.telefono)}</span>` : ''}
            </div>
            <div class="card__resumen">${resumen}</div>
        </div>
        <select class="card__estado-select" onchange="actualizarEstado(${p.id}, this.value)" onclick="event.stopPropagation()">
            ${['pendiente','en_preparacion','listo','entregado'].map(e =>
                `<option value="${e}" ${p.estado === e ? 'selected' : ''}>${etiquetaEstado[e]}</option>`
            ).join('')}
        </select>
        ${btnWA}
    </div>`;
}

// ── Modal detalle ─────────────────────────────────────────────
function abrirModal(id) {
    const p = cargarPedidos().find(x => x.id === id);
    if (!p) return;

    let html = `
        <div class="modal__titulo">Pedido de ${p.cliente}</div>
        <div class="modal__fecha">Recibido el ${p.fechaCreacion} · Entrega: ${p.entrega}</div>
        <div class="modal__pago">
            <span class="modal__pago-etiqueta">${formatearEtiquetaPago(p.metodoPago)}</span>
            ${p.telefono ? `<span class="modal__telefono">📱 ${formatearTelefonoDisplay(p.telefono)}</span>` : ''}
        </div>`;

    if (p.productos && p.productos.length > 0) {
        html += `<div class="modal__seccion"><h4>📦 Productos</h4>`;
        p.productos.forEach(x => {
            const qty = (x.kilos !== null && x.kilos > 0) ? `${x.kilos} kg` : `x${x.cantidad}`;
            html += `<div class="modal__item"><span>${x.nombre}</span><span class="modal__qty">${qty}</span></div>`;
        });
        html += `</div>`;
    }

    if (p.liquidos && p.liquidos.length > 0) {
        html += `<div class="modal__seccion"><h4>💧 Líquidos</h4>`;
        p.liquidos.forEach(l => {
            html += `<div class="modal__item"><span>${l.nombre}</span><span class="modal__qty">${l.litros} L</span></div>`;
        });
        html += `</div>`;
    }

    if (p.granel && p.granel.length > 0) {
        html += `<div class="modal__seccion"><h4>🚚 A Granel</h4>`;
        p.granel.forEach(g => {
            html += `<div class="modal__item"><span>${g.nombre}</span><span class="modal__qty">${g.kilos} kg</span></div>`;
        });
        html += `</div>`;
    }

    if (p.notas) {
        html += `<div class="modal__seccion"><h4>📝 Notas</h4><div class="modal__notas">${p.notas}</div></div>`;
    }

    let accionWA;
    if (p.estado === 'listo') {
        accionWA = `<button class="modal__btn modal__btn--wa" onclick="enviarWAListo(${p.id})">📱 Avisar al cliente — pedido listo${p.telefono ? ` (${formatearTelefonoDisplay(p.telefono)})` : ''}</button>`;
    } else if (p.estado === 'en_preparacion') {
        accionWA = `<button class="modal__btn modal__btn--wa-prep" onclick="enviarWAPreparacion(${p.id})">📱 Avisar al cliente — en preparación${p.telefono ? ` (${formatearTelefonoDisplay(p.telefono)})` : ''}</button>`;
    } else {
        accionWA = `<p class="modal__wa-aviso">Marcá el pedido como <strong>En preparación</strong> o <strong>Listo</strong> para avisar al cliente por WhatsApp.</p>`;
    }

    html += `<div class="modal__acciones">
        ${accionWA}
        <button class="modal__btn modal__btn--del" onclick="eliminarPedido(${p.id})">🗑️ Eliminar pedido</button>
    </div>`;

    document.getElementById('modal__contenido').innerHTML = html;
    document.getElementById('modal').classList.add('modal--visible');
}

function cerrarModal(e) {
    if (e.target.id === 'modal') document.getElementById('modal').classList.remove('modal--visible');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.getElementById('modal').classList.remove('modal--visible');
});

// ── Auto-refresh: localStorage (mismo dispositivo) + Supabase ──
window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY || e.key === PENDIENTES_KEY) renderizar();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarDesdeSupabase();
});

// ── Init ──────────────────────────────────────────────────────
(async function initControlador() {
    renderizar();
    await sincronizarDesdeSupabase();
    setInterval(sincronizarDesdeSupabase, SYNC_INTERVAL_MS);
})();
