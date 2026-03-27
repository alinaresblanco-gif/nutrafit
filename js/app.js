/* =========================================
   SISTEMA CENTRAL NUTRAFIT - VERSIÓN FINAL
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycby7qIh6mwTZPvECqAPNZ3cJF1vfK92fNgTCm-2dKl1g5IBDrEPMSt1DvB5I_JeGjKY7/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;
let actividadActual = 'Caminar';
let archivoImagenActual = null;

/* --- 1. NAVEGACIÓN TIPO APP --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        if (!respuesta.ok) throw new Error("No se encontró la vista");
        
        const textoHtml = await respuesta.text();
        
        contenedorVistas.innerHTML = textoHtml;
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';

        // DISPARADORES SEGÚN LA VISTA CARGADA
        if (nombreVista === 'agua') {
            inicializarAgua();
            cargarHistorico();
        }
        if (nombreVista === 'creditos-diarios') {
            setTimeout(() => { inicializarFecha(); calcularCreditos(); cargarHistorialCreditos(); }, 100);
        }
        if (nombreVista === 'evolucion-peso') {
            setTimeout(inicializarPeso, 100);
        }
        if (nombreVista === 'nuestra_despensa') {
            setTimeout(cargarDespensa, 100); 
        }
        if (nombreVista === 'carrito-compra') {
            setTimeout(actualizarInterfazCompra, 100);
        }
        if (nombreVista === 'ejercicio-diario') {
            setTimeout(() => {
                seleccionarActividad('Caminar'); 
                cargarHistorialEjercicios();
            }, 100);
        }

    } catch (error) {
        console.error("Error al abrir la vista:", error);
        alert("Error 404: No se pudo cargar la vista " + nombreVista);
    }
}

function volverInicio() {
    document.getElementById('pantalla-inicio').style.display = 'flex';
    document.getElementById('contenedor-vistas').style.display = 'none';
}

/* --- 2. LÓGICA DE EJERCICIO DIARIO (ESTILO STRAVA) --- */

function seleccionarActividad(tipo) {
    actividadActual = tipo;
    const botones = document.querySelectorAll('.btn-actividad-selector');
    botones.forEach(btn => btn.classList.remove('activo'));

    if (tipo === 'Caminar') document.getElementById('btn-walk').classList.add('activo');
    if (tipo === 'Ciclismo') document.getElementById('btn-bike').classList.add('activo');
    if (tipo === 'Gimnasio') document.getElementById('btn-gym').classList.add('activo');
}

// Cálculos automáticos de pasos
document.addEventListener('input', function (e) {
    if (e.target.id === 'ej-distancia') {
        const km = parseFloat(e.target.value);
        if (!isNaN(km)) {
            const pasos = Math.round((km * 1000) / 0.65);
            const inputPasos = document.getElementById('ej-pasos');
            if(inputPasos) inputPasos.value = pasos;
        }
    }
});

// Cámara y Fotos
function intentarHacerFoto() {
    const input = document.getElementById('input-captura');
    if(input) {
        input.setAttribute('accept', 'image/*');
        input.click();
    }
}

function previsualizarImagen(input) {
    const contenedor = document.getElementById('previsualizacion-contenedor');
    const img = document.getElementById('img-previa');
    if (input.files && input.files[0]) {
        archivoImagenActual = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            img.src = e.target.result;
            contenedor.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function quitarImagen() {
    archivoImagenActual = null;
    const input = document.getElementById('input-captura');
    if(input) input.value = "";
    const cont = document.getElementById('previsualizacion-contenedor');
    if(cont) cont.style.display = 'none';
}

async function validarYGuardarEjercicio() {
    const tiempo = document.getElementById('ej-tiempo').value;
    const distancia = document.getElementById('ej-distancia').value;
    const btnSave = document.querySelector('.btn-guardar-principal');

    if (!tiempo || !distancia) return alert("Antonio, rellena tiempo y distancia.");

    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';
    btnSave.disabled = true;

    const ahora = new Date();
    const titulo = actividadActual === 'Caminar' ? "CAMINATA DE HOY" : 
                   actividadActual === 'Ciclismo' ? "RUTA EN BICICLETA" : "ACTIVIDAD EN GIMNASIO";
    
    const datos = {
        tipo: "guardar_ejercicio",
        actividad: `${titulo} (${ahora.toLocaleDateString()} - ${ahora.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`,
        tiempo: tiempo,
        distancia: distancia,
        pasos: document.getElementById('ej-pasos').value || 0,
        desnivel: document.getElementById('ej-desnivel').value || 0
    };

    if (archivoImagenActual) {
        const reader = new FileReader();
        reader.readAsDataURL(archivoImagenActual);
        reader.onload = async () => {
            datos.imagenBase64 = reader.result.split(',')[1];
            enviarEjercicio(datos);
        };
    } else {
        enviarEjercicio(datos);
    }
}

async function enviarEjercicio(datos) {
    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("¡Registro guardado en Nutrafit!");
        limpiarFormularioEjercicio();
        cargarHistorialEjercicios();
    } catch (e) { alert("Error al conectar."); }
    finally {
        const btn = document.querySelector('.btn-guardar-principal');
        if(btn) {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> GUARDAR ENTRENAMIENTO';
            btn.disabled = false;
        }
    }
}

async function cargarHistorialEjercicios() {
    const contenedor = document.getElementById('lista-actividades-historial');
    if (!contenedor) return;
    contenedor.innerHTML = '<p style="text-align:center; color:white;">Actualizando historial...</p>';

    try {
        const res = await fetch(`${URL_GOOGLE_SCRIPT}?tabla=ejercicio&t=${Date.now()}`);
        const registros = await res.json();
        contenedor.innerHTML = "";
        
        registros.reverse().forEach(reg => {
            const card = document.createElement('div');
            card.className = "tarjeta-strava";
            card.innerHTML = `
                <div class="strava-header">
                    <div class="strava-titulo">${reg[1]}</div>
                    <button class="btn-compartir" onclick="compartirActividad('${reg[1]}', '${reg[4]}km')">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
                ${reg[3] ? `<img src="${reg[3]}" class="strava-imagen">` : ''}
                <div class="strava-stats">
                    <div class="stat"><span>Km</span><strong>${reg[4]}</strong></div>
                    <div class="stat"><span>Min</span><strong>${reg[2]}</strong></div>
                    <div class="stat"><span>Km/h</span><strong>${reg[7]}</strong></div>
                </div>
                <div class="strava-footer">
                    <span><i class="fas fa-shoe-prints"></i> ${reg[5]}</span>
                    <span><i class="fas fa-mountain"></i> ${reg[6]}m</span>
                </div>`;
            contenedor.appendChild(card);
        });
    } catch (e) { 
        contenedor.innerHTML = '<p style="color:white; text-align:center;">Registra tu actividad para verla aquí.</p>'; 
    }
}

function abrirStravaExterno() {
    window.open("https://www.strava.com/dashboard", "_blank");
}

function limpiarFormularioEjercicio() {
    const campos = ['ej-tiempo', 'ej-distancia', 'ej-desnivel', 'ej-pasos'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    quitarImagen();
}

function compartirActividad(t, d) {
    const txt = `Nutrafit: ${t} - Distancia: ${d}. ¡Seguimos!`;
    if (navigator.share) navigator.share({ title: 'Nutrafit', text: txt });
    else alert("Copiado al portapapeles: " + txt);
}

/* --- 3. LÓGICA DE CONTROL DE AGUA --- */
function inicializarAgua() {
    vasosActuales = parseInt(localStorage.getItem('agua_nutrafit')) || 0;
    actualizarInterfazAgua();
}
function gestionarVaso(i) {
    i < vasosActuales ? vasosActuales = i : (vasosActuales < objetivoDiario && vasosActuales++);
    localStorage.setItem('agua_nutrafit', vasosActuales);
    actualizarInterfazAgua();
}
function actualizarInterfazAgua() {
    const t = document.getElementById('contador-texto'), b = document.getElementById('barra-llenado'), btns = document.querySelectorAll('.boton-vaso');
    if (t) t.innerText = `${vasosActuales} / ${objetivoDiario} Vasos`;
    if (b) b.style.width = `${(vasosActuales/objetivoDiario)*100}%`;
    btns.forEach((btn, idx) => idx < vasosActuales ? btn.classList.add('activo') : btn.classList.remove('activo'));
}
async function reiniciarAgua() {
    if (vasosActuales === 0) return alert("Marca al menos un vaso");
    await fetch(URL_GOOGLE_SCRIPT, { method: "POST", mode: "no-cors", body: JSON.stringify({ tipo: "agua", vasos: vasosActuales }) });
    vasosActuales = 0; localStorage.setItem('agua_nutrafit', 0); actualizarInterfazAgua(); setTimeout(cargarHistorico, 1000);
}
async function cargarHistorico() {
    const c = document.getElementById('datos-tabla'); if (!c) return;
    try {
        const r = await fetch(URL_GOOGLE_SCRIPT + "?t=" + Date.now());
        const f = await r.json();
        c.innerHTML = f.map(fila => `<tr><td>${new Date(fila[0]).toLocaleDateString()}</td><td>${fila[1]}</td><td>${fila[2]}</td></tr>`).join('');
    } catch(e) { console.log("Error agua", e); }
}

/* --- 4. LÓGICA DE CRÉDITOS --- */
function ajustarValor(id, inc) {
    const input = document.getElementById(id); if(!input) return;
    input.value = (parseFloat(input.value || 0) + inc).toFixed(id==='peso-credito'?1:0);
    calcularCreditos();
}
function calcularCreditos() {
    const g = document.getElementById('genero-credito')?.value, p = parseFloat(document.getElementById('peso-credito')?.value), 
          a = parseFloat(document.getElementById('altura-credito')?.value), e = parseInt(document.getElementById('edad-credito')?.value);
    if (p && a && e) {
        let tmb = (g === "Hombre") ? (10*p)+(6.25*a)-(5*e)+5 : (10*p)+(6.25*a)-(5*e)-161;
        document.getElementById('resultado-creditos').value = Math.ceil((tmb * 0.9) / 35);
    }
}
function inicializarFecha() { 
    const f = document.getElementById('fecha-credito'); if(f) f.value = new Date().toISOString().split('T')[0]; 
}
async function guardarCreditos() {
    const total = document.getElementById('resultado-creditos').value;
    const datos = { tipo: "creditos", fecha: document.getElementById('fecha-credito').value, total: total };
    await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
    alert("Créditos guardados"); cargarHistorialCreditos();
}
async function cargarHistorialCreditos() {
    const c = document.getElementById('tabla-creditos-body'); if (!c) return;
    const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=creditos&t=" + Date.now());
    const d = await res.json();
    c.innerHTML = d.map(f => `<tr><td>${new Date(f[0]).toLocaleDateString()}</td><td>${f[5]}</td><td>${f[1]}</td></tr>`).join('');
}

/* --- 5. LÓGICA DE PESO Y IMC --- */
function inicializarPeso() {
    const f = document.getElementById('fecha-peso'); if(f) f.value = new Date().toISOString().split('T')[0];
    cargarHistorialPeso();
}
async function guardarPeso() {
    const p = document.getElementById('input-peso').value;
    const datos = { tipo: "peso", fecha: document.getElementById('fecha-peso').value, peso: p, diferencia: 0 };
    await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
    alert("Peso guardado"); cargarHistorialPeso();
}
async function cargarHistorialPeso() {
    const c = document.getElementById('tabla-peso-body'); if(!c) return;
    const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=peso&t=" + Date.now());
    const d = await res.json();
    c.innerHTML = d.map(f => `<tr><td>${new Date(f[0]).toLocaleDateString()}</td><td>${f[1]} kg</td><td>${f[2]}</td></tr>`).join('');
}

/* --- 6. DESPENSA Y LISTA COMPRA --- */
async function cargarDespensa() {
    const c = document.getElementById('lista-alimentos-agrupados'); if(!c) return;
    const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=alimentos&t=" + Date.now());
    const d = await res.json();
    c.innerHTML = d.map(a => `<div class="fila-alimento"><b>${a[0]}</b> - ${a[8]} créd.</div>`).join('');
}
function filtrarDespensa() {
    const t = document.getElementById('buscador-despensa').value.toLowerCase();
    document.querySelectorAll('.fila-alimento').forEach(f => f.style.display = f.innerText.toLowerCase().includes(t) ? "" : "none");
}

/* --- 7. LISTA DE COMPRA --- */
let listaCompra = JSON.parse(localStorage.getItem('nutrafit_lista_compra')) || [];
function actualizarInterfazCompra() {
    const c = document.getElementById('lista-compra-items'); if(!c) return;
    localStorage.setItem('nutrafit_lista_compra', JSON.stringify(listaCompra));
    c.innerHTML = listaCompra.map(i => `
        <div class="item-compra ${i.comprado ? 'comprado' : ''}">
            <span>${i.nombre} (${i.cantidad})</span>
            <input type="checkbox" ${i.comprado ? 'checked' : ''} onchange="toggleComprado(${i.id})">
            <button onclick="eliminarItemCompra(${i.id})"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}
function agregarItemCompra() {
    const n = document.getElementById('item-nombre').value, q = document.getElementById('item-cantidad').value || "1";
    if(!n) return;
    listaCompra.push({ id: Date.now(), nombre: n, cantidad: q, comprado: false });
    document.getElementById('item-nombre').value = ""; actualizarInterfazCompra();
}
function toggleComprado(id) { 
    const i = listaCompra.find(x => x.id === id); if(i) i.comprado = !i.comprado; actualizarInterfazCompra(); 
}
function eliminarItemCompra(id) { 
    listaCompra = listaCompra.filter(x => x.id !== id); actualizarInterfazCompra(); 
}

// Carga inicial
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('lista-actividades-historial')) cargarHistorialEjercicios();
});