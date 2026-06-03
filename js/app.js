 /* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
// const URL_GOOGLE_SCRIPT definido en index.html para autenticación (actualizado)


// Variables globales de estado
let vasosActuales = 0;
let vasosTotalesDia = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;
let temporizadorReinicioAgua = null;
// Usuario activo y dispositivo
let usuarioActivo = localStorage.getItem('nutrafit_usuario_id') || null;
let dispositivoId = localStorage.getItem('nutrafit_dispositivo_id') || null;
let vistaActual = null;

function mostrarInicioEnContenedor() {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');
    if (!pantallaInicio || !contenedorVistas) return;

    pantallaInicio.style.display = 'flex';
    contenedorVistas.style.display = 'none';
    vistaActual = null;
}

function inicializarNavegacionMovil() {
    if (window.__nutrafitNavInit) return;
    window.__nutrafitNavInit = true;

    // Estado base para que el botón atrás del móvil vuelva primero al inicio.
    if (!history.state || !history.state.nutrafit) {
        history.replaceState({ nutrafit: true, vista: null }, '', window.location.href);
    }

    window.addEventListener('popstate', (event) => {
        const pantallaInicio = document.getElementById('pantalla-inicio');
        const contenedorVistas = document.getElementById('contenedor-vistas');
        if (!pantallaInicio || !contenedorVistas) return;

        const estado = event.state;
        if (estado && estado.nutrafit && estado.vista) {
            abrirVista(estado.vista, { desdeHistorial: true });
            return;
        }

        mostrarInicioEnContenedor();
    });
}

function parseFechaYMD(fechaStr) {
    if (!fechaStr) return null;
    const partes = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!partes) return null;
    const anio = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);
    return new Date(anio, mes - 1, dia);
}

function formatearFechaYMDLocal(fecha) {
    if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return "";
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

function normalizarFechaYMD(valor) {
    if (!valor) return "";

    const fechaDirecta = parseFechaYMD(valor);
    if (fechaDirecta) return formatearFechaYMDLocal(fechaDirecta);

    const parsed = new Date(valor);
    if (isNaN(parsed.getTime())) return "";

    return formatearFechaYMDLocal(parsed);
}

function formatearFechaES(valor) {
    const ymd = normalizarFechaYMD(valor);
    if (!ymd) return "---";

    const fecha = parseFechaYMD(ymd);
    return fecha ? fecha.toLocaleDateString('es-ES') : "---";
}

function obtenerPresupuestoSemanaActual() {
    const guardadoLunes = parseFloat(localStorage.getItem(clavePresupuestoDia('lunes')));
    if (!isNaN(guardadoLunes)) return Math.round(guardadoLunes);

    const inputActivo = document.getElementById('total-' + diaActual) || document.querySelector('[id^="total-"]');
    const valorActivo = parseFloat(inputActivo?.value);
    if (!isNaN(valorActivo)) return Math.round(valorActivo);

    return 30;
}

function obtenerPresupuestoDiaActual() {
    const guardado = parseFloat(localStorage.getItem(clavePresupuestoDia(diaActual)));
    if (!isNaN(guardado)) return guardado;

    const input = document.getElementById('total-' + diaActual);
    const valorInput = parseFloat(input?.value);
    if (!isNaN(valorInput)) return valorInput;

    return 30;
}

async function obtenerUltimoCreditoCalculadoUsuario() {
    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) return null;

    const cacheKey = `creditos_nutrafit_${uid.toLowerCase()}`;
    const cache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (Array.isArray(cache) && cache.length > 0) {
        const ultimoCache = parseFloat(cache[0]?.[6]);
        if (!isNaN(ultimoCache) && ultimoCache > 0) {
            return Math.round(ultimoCache);
        }
    }

    try {
        const query = new URLSearchParams({
            tabla: 'creditos',
            usuario_id: uid,
            t: String(Date.now())
        });
        const resp = await fetch(`${URL_GOOGLE_SCRIPT}?${query.toString()}`);
        const payload = await resp.json();
        const filas = extraerFilasRespuestaGoogle(payload);
        if (Array.isArray(filas) && filas.length > 0) {
            localStorage.setItem(cacheKey, JSON.stringify(filas.slice(0, 10)));
            const ultimo = parseFloat(filas[0]?.[6]);
            if (!isNaN(ultimo) && ultimo > 0) return Math.round(ultimo);
        }
    } catch (e) {
        console.log('No se pudo leer último crédito para presupuesto semanal');
    }

    return null;
}

async function sincronizarPresupuestoConUltimoCredito() {
    const presupuestoInput = document.getElementById('total-' + diaActual) || document.querySelector('[id^="total-"]');
    if (!presupuestoInput) return;

    const diasSemana = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

    const ultimoCredito = await obtenerUltimoCreditoCalculadoUsuario();
    if (ultimoCredito === null) return;

    // Blindaje: al abrir menús siempre sincroniza con el último crédito diario válido.
    presupuestoInput.value = String(ultimoCredito);
    diasSemana.forEach(dia => {
        localStorage.setItem(clavePresupuestoDia(dia), String(ultimoCredito));
    });
    recalcularDisponiblesSemana();
    guardarEstadoSemanaLocal();
    actualizarPuntos();
}

function extraerMensajeErrorGoogle(payload) {
    if (!payload || Array.isArray(payload)) return "";
    return String(payload.error || payload.message || payload.mensaje || "").trim();
}

function extraerFilasRespuestaGoogle(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.result)) return payload.result;

    return [];
}

/* --- 1. NAVEGACIÓN TIPO APP (ACTUALIZADA) --- */
async function abrirVista(nombreVista, opciones = {}) {
    const desdeHistorial = Boolean(opciones && opciones.desdeHistorial);
    // Solo permitir si usuario autenticado
    if (!usuarioActivo) {
        alert('Debes iniciar sesión para acceder a la app.');
        return;
    }
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');
    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        const textoHtml = await respuesta.text();
        contenedorVistas.innerHTML = textoHtml;
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';
        vistaActual = nombreVista;

        if (!desdeHistorial) {
            history.pushState({ nutrafit: true, vista: nombreVista }, '', window.location.href);
        }

        // DISPARADORES SEGÚN LA VISTA CARGADA
        if (nombreVista === 'agua') {
            inicializarAgua();
            cargarHistorico();
        }
        if (nombreVista === 'creditos-diarios') {
            setTimeout(() => {
                inicializarFecha(); 
                calcularCreditos(); 
                cargarHistorialCreditos(); 
            }, 100);
        }
        if (nombreVista === 'evolucion-peso') {
            setTimeout(inicializarPeso, 100);
        }
        if (nombreVista === 'nuestra_despensa') {
            setTimeout(cargarDespensa, 100); 
        }
        if (nombreVista === 'diario-formulario') {
            setTimeout(() => {
                cargarDespensaDiario();
                cargarHistorialSemanas();
                asegurarPapeleraEnFilasDiario();
                sincronizarPresupuestoConUltimoCredito();
            }, 300);
        }
        if (nombreVista === 'carrito-compra') {
            setTimeout(actualizarInterfazCompra, 100);
        }
    } catch (error) {
        console.error("Error al abrir la vista:", error);
    }
}

function volverInicio() {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    // Modo app embebida (index.html)
    if (pantallaInicio && contenedorVistas) {
        if (vistaActual && history.state && history.state.nutrafit && history.state.vista) {
            history.back();
            return;
        }

        mostrarInicioEnContenedor();
        return;
    }

    // Compatibilidad para uso directo de vistas sueltas.
    if (window.location.pathname.includes('/vistas/')) {
        window.location.href = '../index.html';
    } else {
        window.location.href = 'index.html';
    }
}

/* --- 2. LÓGICA DE CONTROL DE AGUA --- */
function obtenerFechaHoyLocal() {
    return formatearFechaYMDLocal(new Date());
}

function obtenerPrefijoAguaUsuario() {
    const usuario = (usuarioActivo || 'anonimo').toLowerCase();
    return `agua_nutrafit_${usuario}`;
}

function claveAgua(sufijo) {
    return `${obtenerPrefijoAguaUsuario()}_${sufijo}`;
}

function claveHistorialAgua() {
    return claveAgua('historial');
}

function mapearFilaAguaParaVista(fila) {
    // Formato antiguo: [fecha, vasos, estado, hora]
    // Formato nuevo:   [usuario_id, fecha, vasos, estado, hora]
    const tieneUsuarioId = Array.isArray(fila) && fila.length >= 5;
    const idxFecha = tieneUsuarioId ? 1 : 0;
    const idxVasos = tieneUsuarioId ? 2 : 1;
    const idxEstado = tieneUsuarioId ? 3 : 2;

    const fechaRaw = fila[idxFecha];
    const vasos = fila[idxVasos] || "";
    const estado = fila[idxEstado] || "";
    const colorEstado = estado === "COMPLETADO" ? "#2ecc71" : "#e67e22";

    const fecha = new Date(fechaRaw);
    const fechaTexto = isNaN(fecha.getTime()) ? String(fechaRaw || "") : fecha.toLocaleDateString('es-ES');

    return `<tr><td>${fechaTexto}</td><td>${vasos}</td><td style="color:${colorEstado}; font-weight:bold;">${estado}</td></tr>`;
}

function pintarHistoricoAgua(contenedor, filas) {
    const lista = Array.isArray(filas) ? filas : [];
    contenedor.innerHTML = lista.map(mapearFilaAguaParaVista).join('') || "<tr><td colspan='3'>Sin registros</td></tr>";
}

function persistirEstadoAgua() {
    localStorage.setItem(claveAgua('ciclo'), String(vasosActuales));
    localStorage.setItem(claveAgua('total_dia'), String(vasosTotalesDia));
    localStorage.setItem(claveAgua('fecha'), obtenerFechaHoyLocal());
}

function resetearAguaSiCambioDeDia() {
    const fechaGuardada = localStorage.getItem(claveAgua('fecha'));
    const hoy = obtenerFechaHoyLocal();
    if (fechaGuardada && fechaGuardada !== hoy) {
        vasosActuales = 0;
        vasosTotalesDia = 0;
        persistirEstadoAgua();
    }
}

function programarReinicioAguaMedianoche() {
    if (temporizadorReinicioAgua) {
        clearTimeout(temporizadorReinicioAgua);
    }

    const ahora = new Date();
    const proximaMedianoche = new Date(
        ahora.getFullYear(),
        ahora.getMonth(),
        ahora.getDate() + 1,
        0, 0, 0, 0
    );
    const msRestantes = Math.max(1000, proximaMedianoche.getTime() - ahora.getTime());

    temporizadorReinicioAgua = setTimeout(() => {
        vasosActuales = 0;
        vasosTotalesDia = 0;
        persistirEstadoAgua();
        actualizarInterfazAgua();
        programarReinicioAguaMedianoche();
    }, msRestantes);
}

function inicializarAgua() {
    const legacy = localStorage.getItem('agua_nutrafit');
    const guardadoCiclo = localStorage.getItem(claveAgua('ciclo'));
    const guardadoTotal = localStorage.getItem(claveAgua('total_dia'));
    const fechaGuardada = localStorage.getItem(claveAgua('fecha'));
    const hoy = obtenerFechaHoyLocal();

    vasosActuales = guardadoCiclo !== null
        ? parseInt(guardadoCiclo, 10) || 0
        : (legacy ? parseInt(legacy, 10) || 0 : 0);
    vasosTotalesDia = guardadoTotal !== null
        ? parseInt(guardadoTotal, 10) || 0
        : vasosActuales;

    if (!fechaGuardada || fechaGuardada !== hoy) {
        vasosActuales = 0;
        vasosTotalesDia = 0;
    }

    persistirEstadoAgua();
    actualizarInterfazAgua();
    programarReinicioAguaMedianoche();
}

function gestionarVaso(indiceVaso) {
    resetearAguaSiCambioDeDia();

    if (indiceVaso < vasosActuales) {
        const diferencia = indiceVaso - vasosActuales;
        vasosActuales = indiceVaso;
        vasosTotalesDia = Math.max(0, vasosTotalesDia + diferencia);
    } else {
        if (vasosActuales < objetivoDiario) {
            vasosActuales++;
            vasosTotalesDia++;

            if (vasosActuales === objetivoDiario) {
                const continuar = confirm(
                    "Has completado los 8 vasos de este ciclo.\n\n¿Quieres seguir acumulando más vasos hoy?"
                );

                if (continuar) {
                    vasosActuales = 0;
                    alert("Perfecto. Empezamos un nuevo ciclo de 8 vasos y seguimos sumando al total de hoy.");
                }
            }
        }
    }

    persistirEstadoAgua();
    // Compatibilidad temporal con clave antigua
    localStorage.setItem('agua_nutrafit', String(vasosActuales));
    actualizarInterfazAgua();
}

function actualizarInterfazAgua() {
    const texto = document.getElementById('contador-texto');
    const barra = document.getElementById('barra-llenado');
    const botones = document.querySelectorAll('.boton-vaso');

    if (texto) texto.innerText = `${vasosActuales} / ${objetivoDiario} Vasos (Total hoy: ${vasosTotalesDia})`;
    if (barra) barra.style.width = `${(vasosActuales / objetivoDiario) * 100}%`;

    botones.forEach((btn, index) => {
        index < vasosActuales ? btn.classList.add('activo') : btn.classList.remove('activo');
    });
}

async function reiniciarAgua() {
    resetearAguaSiCambioDeDia();

    if (vasosTotalesDia === 0) return alert("¡Marca al menos un vaso!");
    if (confirm("¿Guardar y reiniciar?")) {
        // Re-leer sesión por si app.js se cargó antes del login
        const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
        const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');
        if (!uid || !did) return alert("No hay sesión activa. Vuelve a identificarte.");

        try {
            const respuesta = await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                body: JSON.stringify({
                    tipo: "agua",
                    vasos: vasosTotalesDia,
                    usuario_id: uid,
                    dispositivo_id: did
                })
            });
            const textoRespuesta = String(await respuesta.text()).trim();
            const guardadoOk = respuesta.ok && /exito agua|éxito agua/i.test(textoRespuesta);
            if (!guardadoOk) {
                throw new Error(textoRespuesta || `Error HTTP ${respuesta.status}`);
            }
            alert("¡Datos enviados!");

            // Actualiza caché local para que la próxima carga sea instantánea.
            const ahora = new Date();
            const filaNueva = [
                String(uid || '').toLowerCase(),
                ahora.toLocaleDateString('es-ES'),
                `${vasosTotalesDia} vasos`,
                (vasosTotalesDia >= objetivoDiario) ? "COMPLETADO" : "PENDIENTE",
                ahora.toLocaleTimeString()
            ];
            const cacheActual = JSON.parse(localStorage.getItem(claveHistorialAgua()) || '[]');
            const cacheNuevo = [filaNueva, ...cacheActual].slice(0, 10);
            localStorage.setItem(claveHistorialAgua(), JSON.stringify(cacheNuevo));

            vasosActuales = 0;
            vasosTotalesDia = 0;
            persistirEstadoAgua();
            localStorage.setItem('agua_nutrafit', '0');
            actualizarInterfazAgua();
            setTimeout(cargarHistorico, 300); 
        } catch (error) {
            console.error("Error guardando agua", error);
            const detalle = error && error.message ? ` (${error.message})` : "";
            alert("No se pudo guardar el registro" + detalle);
        }
    }
}

async function cargarHistorico() {
    const contenedor = document.getElementById('datos-tabla');
    if (!contenedor) return;
    try {
        // Re-leer siempre desde localStorage por si se generaron después de cargar app.js
        const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
        const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');

        if (!uid || !did) {
            contenedor.innerHTML = "<tr><td colspan='3'>Sin sesión activa</td></tr>";
            return;
        }

        // Actualizar globales si estaban vacíos
        if (!usuarioActivo) usuarioActivo = uid;
        if (!dispositivoId) dispositivoId = did;

        // 1) Pintado instantáneo desde caché local
        const cacheLocal = JSON.parse(localStorage.getItem(claveHistorialAgua()) || '[]');
        if (Array.isArray(cacheLocal) && cacheLocal.length > 0) {
            pintarHistoricoAgua(contenedor, cacheLocal);
        }

        // 2) Refresco desde backend
        const query = new URLSearchParams({
            tabla: "agua",
            usuario_id: usuarioActivo,
            dispositivo_id: dispositivoId,
            t: String(new Date().getTime())
        });
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?" + query.toString());
        const filas = await respuesta.json();
        pintarHistoricoAgua(contenedor, filas);
        localStorage.setItem(claveHistorialAgua(), JSON.stringify(Array.isArray(filas) ? filas.slice(0, 10) : []));
    } catch (error) {
        console.error("Error historial agua", error);
        // Si falla red, mantiene lo que se pintó desde caché.
        if (!contenedor.innerHTML || contenedor.innerHTML.trim() === "") {
            contenedor.innerHTML = "<tr><td colspan='3'>No se pudo cargar el historial</td></tr>";
        }
    }
}

/* --- 3. LÓGICA DE CRÉDITOS --- */
function ajustarValor(id, incremento) {
    const input = document.getElementById(id);
    if (!input) return;
    let valorActual = parseFloat(input.value) || 0;
    input.value = (valorActual + incremento).toFixed(id === 'peso-credito' ? 1 : 0);
    calcularCreditos();
}

function calcularCreditos() {
    const genElem = document.getElementById('genero-credito');
    const pesoElem = document.getElementById('peso-credito');
    const altElem = document.getElementById('altura-credito');
    const edadElem = document.getElementById('edad-credito');
    const resElem = document.getElementById('resultado-creditos');

    if (!genElem || !pesoElem || !altElem || !edadElem || !resElem) return;

    const genero = genElem.value;
    const peso = parseFloat(pesoElem.value) || 0;
    const altura = parseFloat(altElem.value) || 0;
    const edad = parseInt(edadElem.value) || 0;

    if (peso > 0 && altura > 0 && edad > 0) {
        let tmb = (genero === "Hombre") 
            ? (10 * peso) + (6.25 * altura) - (5 * edad) + 5
            : (10 * peso) + (6.25 * altura) - (5 * edad) - 161;
        resElem.value = Math.ceil((tmb * 0.9) / 35);
    }
}

function inicializarFecha() {
    const f = document.getElementById('fecha-credito');
    if(f) f.value = new Date().toISOString().split('T')[0];
}

async function guardarCreditos() {
    const total = document.getElementById('resultado-creditos').value;
    if (!total || total == 0) return alert("Primero calcula tus créditos");

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) return alert("No hay sesión activa. Vuelve a identificarte.");

    const fecha  = document.getElementById('fecha-credito').value;
    const genero = document.getElementById('genero-credito').value;
    const edad   = document.getElementById('edad-credito').value;
    const peso   = document.getElementById('peso-credito').value;
    const altura = document.getElementById('altura-credito').value;

    const datos = {
        tipo: "creditos",
        usuario_id: uid,
        fecha, genero, edad, peso, altura, total
    };

    try {
        const resp = await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', body: JSON.stringify(datos) });
        const txt  = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        alert("¡Créditos guardados!");

        // Actualizar caché local inmediatamente
        const cacheKey = `creditos_nutrafit_${uid.toLowerCase()}`;
        const filaNueva = [uid, fecha, genero, edad, peso, altura, total];
        const cacheActual = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        localStorage.setItem(cacheKey, JSON.stringify([filaNueva, ...cacheActual].slice(0, 10)));

        cargarHistorialCreditos();
    } catch (e) {
        console.error("Error guardando créditos", e);
        alert("Error al guardar: " + (e.message || e));
    }
}

function pintarHistorialCreditos(cuerpoTabla, filas) {
    // Columnas en hoja: [usuario_id(0), fecha(1), genero(2), edad(3), peso(4), altura(5), total(6)]
    if (!Array.isArray(filas) || filas.length === 0) {
        cuerpoTabla.innerHTML = "<tr><td colspan='3' style='padding:15px;'>Sin registros</td></tr>";
        return;
    }
    cuerpoTabla.innerHTML = filas.map(fila => {
        const fecha   = formatearFechaES(fila[1] || fila[0] || '');
        const total   = fila[6] !== undefined ? fila[6] : (fila[5] || '---');
        const genero  = fila[2] || fila[1] || '---';
        return `<tr>
            <td>${fecha}</td>
            <td style="font-weight:bold; color:#78a978;">${total}</td>
            <td>${genero}</td>
        </tr>`;
    }).join('');
}

function aplicarUltimoRegistroCreditos(filas) {
    if (!Array.isArray(filas) || filas.length === 0) return;

    // El historial se pinta en orden más reciente -> más antiguo.
    const ultimo = filas[0] || [];
    const genElem = document.getElementById('genero-credito');
    const edadElem = document.getElementById('edad-credito');
    const pesoElem = document.getElementById('peso-credito');
    const altElem = document.getElementById('altura-credito');

    if (!genElem || !edadElem || !pesoElem || !altElem) return;

    const genero = String(ultimo[2] || '').trim();
    const edad = parseInt(ultimo[3], 10);
    const peso = parseFloat(ultimo[4]);
    const altura = parseFloat(ultimo[5]);

    if (genero === 'Hombre' || genero === 'Mujer') genElem.value = genero;
    if (!isNaN(edad) && edad > 0) edadElem.value = String(edad);
    if (!isNaN(peso) && peso > 0) pesoElem.value = String(peso);
    if (!isNaN(altura) && altura > 0) altElem.value = String(altura);

    calcularCreditos();
}

async function cargarHistorialCreditos() {
    const cuerpoTabla = document.getElementById('tabla-creditos-body');
    if (!cuerpoTabla) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) {
        cuerpoTabla.innerHTML = "<tr><td colspan='3' style='padding:15px;'>Sin sesión activa</td></tr>";
        return;
    }
    if (!usuarioActivo) usuarioActivo = uid;

    const cacheKey = `creditos_nutrafit_${uid.toLowerCase()}`;

    // 1) Pintado instantáneo desde caché local
    const cacheLocal = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (cacheLocal.length > 0) {
        pintarHistorialCreditos(cuerpoTabla, cacheLocal);
        aplicarUltimoRegistroCreditos(cacheLocal);
    }

    // 2) Refresco desde backend
    try {
        const query = new URLSearchParams({
            tabla: "creditos",
            usuario_id: uid,
            t: String(Date.now())
        });
        const response = await fetch(URL_GOOGLE_SCRIPT + "?" + query.toString());
        const datos = await response.json();
        pintarHistorialCreditos(cuerpoTabla, datos);
        localStorage.setItem(cacheKey, JSON.stringify(Array.isArray(datos) ? datos.slice(0, 10) : []));
        aplicarUltimoRegistroCreditos(datos);
    } catch (e) {
        console.error("Error historial créditos", e);
        if (!cacheLocal.length) {
            cuerpoTabla.innerHTML = "<tr><td colspan='3' style='padding:15px;'>No se pudo cargar el historial</td></tr>";
        }
    }
}

/* --- 4. LÓGICA DE EVOLUCIÓN DE PESO --- */
function inicializarPeso() {
    const inputFecha = document.getElementById('fecha-peso');
    if(inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
    cargarHistorialPeso();
}

function ajustarPeso(valor) {
    const input = document.getElementById('input-peso');
    if (!input) return;
    let actual = parseFloat(input.value) || 70; 
    let nuevoPeso = (actual + valor).toFixed(1);
    input.value = nuevoPeso;
    calcularIMC(nuevoPeso);
}

function calcularIMC(peso) {
    const inputAltura = document.getElementById('altura-credito');
    let altura = (inputAltura && parseFloat(inputAltura.value) > 0) ? parseFloat(inputAltura.value) / 100 : 1.70; 
    
    if (altura > 0) {
        const imc = (peso / (altura * altura)).toFixed(1);
        actualizarInterfazIMC(imc);
    }
}

function actualizarInterfazIMC(imc) {
    const contenedor = document.getElementById('contenedor-imc');
    const valorElem = document.getElementById('valor-imc');
    const estadoElem = document.getElementById('estado-imc');
    
    if (!valorElem || !estadoElem) return;
    if (contenedor) contenedor.style.display = "block";

    valorElem.innerText = imc;
    let color = "#ccc", texto = "";

    if (imc < 18.5) { texto = "Bajo Peso"; color = "#3498db"; }
    else if (imc < 25) { texto = "Normal"; color = "#2ecc71"; }
    else if (imc < 30) { texto = "Sobrepeso"; color = "#f1c40f"; }
    else { texto = "Obesidad"; color = "#e74c3c"; }

    estadoElem.innerText = texto.toUpperCase();
    estadoElem.style.background = color;
}

async function guardarPeso() {
    const inputPeso = document.getElementById('input-peso');
    const inputFecha = document.getElementById('fecha-peso');
    if(!inputPeso || !inputPeso.value) return alert("Introduce el peso");

    const pesoActual = parseFloat(inputPeso.value);
    const fecha = inputFecha.value;
    const tabla = document.getElementById('tabla-peso-body');
    let ultimoPeso = pesoActual;
    
    if (tabla && tabla.rows.length > 0 && !tabla.rows[0].innerText.includes("registros")) {
        ultimoPeso = parseFloat(tabla.rows[0].cells[1].innerText);
    }

    const diferencia = (pesoActual - ultimoPeso).toFixed(1);

    if (diferencia < 0) {
        alert(`¡ESPECTACULAR! Has bajado ${Math.abs(diferencia)} kg. ¡Te mereces un premio sano! 🥳`);
    } else if (diferencia > 0) {
        alert(`¡No te rindas! Has subido ${diferencia} kg, pero mañana es un nuevo día para mejorar. 💪`);
    } else {
        alert("Te mantienes estable. ¡Sigue así!");
    }

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) return alert("No hay sesión activa. Vuelve a identificarte.");
    if (!usuarioActivo) usuarioActivo = uid;

    const datos = { tipo: "peso", usuario_id: uid, fecha: fecha, peso: pesoActual, diferencia: diferencia };

    try {
        const resp = await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', body: JSON.stringify(datos) });
        const txt  = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        // Actualizar caché local inmediatamente
        const cacheKey = `peso_nutrafit_${uid.toLowerCase()}`;
        const filaNueva = [uid, fecha, String(pesoActual), String(diferencia), null];
        const cacheActual = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        localStorage.setItem(cacheKey, JSON.stringify([filaNueva, ...cacheActual].slice(0, 15)));

        cargarHistorialPeso();
    } catch (e) {
        console.error("Error guardando peso", e);
        alert("Error al guardar: " + (e.message || e));
    }
}

function pintarHistorialPeso(cuerpo, datos) {
    // Columnas en hoja: [usuario_id(0), fecha(1), peso(2), diferencia(3), rowId(4)]
    if (!Array.isArray(datos) || datos.length === 0) {
        cuerpo.innerHTML = "<tr><td colspan='4'>Aún no hay registros</td></tr>";
        return;
    }
    cuerpo.innerHTML = datos.map(fila => {
        const dif   = parseFloat(fila[3]) || 0;
        const icono = dif < 0 ? "↓" : (dif > 0 ? "↑" : "");
        const rowId = fila[4] !== undefined ? String(fila[4]) : '';
        const fecha = String(fila[1] || '').replace(/"/g, '&quot;');
        const peso  = String(fila[2] || '').replace(/"/g, '&quot;');
        const difTxt = String(fila[3] || '').replace(/"/g, '&quot;');
        return `<tr>
            <td>${formatearFechaES(fila[1] || '')}</td>
            <td style="font-weight:bold;">${fila[2]} kg</td>
            <td style="font-weight:bold; color:${dif < 0 ? '#2ecc71' : '#e74c3c'}">${icono} ${Math.abs(dif).toFixed(1)}</td>
            <td style="text-align:center;">
                <button onclick="eliminarRegistroPeso('${rowId}', '${fecha}', '${peso}', '${difTxt}')" title="Eliminar registro" style="border:none; background:transparent; color:#e74c3c; cursor:pointer; font-size:16px;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function eliminarRegistroPeso(rowId, fecha, peso, diferencia) {
    if (!confirm('¿Eliminar este registro de peso?')) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');
    if (!uid || !did) return alert('No hay sesión activa. Vuelve a identificarte.');

    try {
        const payload = {
            tipo: 'eliminar_peso',
            usuario_id: uid,
            dispositivo_id: did,
            row_id: rowId || '',
            fecha: fecha || '',
            peso: peso || '',
            diferencia: diferencia || ''
        };

        const resp = await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', body: JSON.stringify(payload) });
        const txt = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        // Limpiar caché local (por rowId si existe; si no, por fecha+peso+diferencia)
        const cacheKey = `peso_nutrafit_${uid.toLowerCase()}`;
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const nuevoCache = cache.filter(f => {
            if (!Array.isArray(f)) return true;
            const mismoRow = String(f[4] || '') && String(f[4] || '') === String(rowId || '');
            const mismaFirma = String(f[1] || '') === String(fecha || '')
                && String(f[2] || '') === String(peso || '')
                && String(f[3] || '') === String(diferencia || '');
            return !(mismoRow || mismaFirma);
        });
        localStorage.setItem(cacheKey, JSON.stringify(nuevoCache));

        cargarHistorialPeso();
    } catch (e) {
        console.error('Error eliminando peso', e);
        alert('No se pudo eliminar: ' + (e.message || e));
    }
}

async function cargarHistorialPeso() {
    const cuerpo = document.getElementById('tabla-peso-body');
    if (!cuerpo) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) {
        cuerpo.innerHTML = "<tr><td colspan='4'>Sin sesión activa</td></tr>";
        return;
    }
    if (!usuarioActivo) usuarioActivo = uid;

    const cacheKey = `peso_nutrafit_${uid.toLowerCase()}`;

    // 1) Pintado instantáneo desde caché local
    const cacheLocal = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (cacheLocal.length > 0) {
        pintarHistorialPeso(cuerpo, cacheLocal);
        calcularIMC(parseFloat(cacheLocal[0][2]));
        renderizarGrafico([...cacheLocal].reverse());
    }

    // 2) Refresco desde backend
    try {
        const query = new URLSearchParams({ tabla: "peso", usuario_id: uid, t: String(Date.now()) });
        const res   = await fetch(URL_GOOGLE_SCRIPT + "?" + query.toString());
        const datos = await res.json();

        pintarHistorialPeso(cuerpo, datos);
        if (Array.isArray(datos) && datos.length > 0) {
            calcularIMC(parseFloat(datos[0][2]));
            renderizarGrafico([...datos].reverse());
            localStorage.setItem(cacheKey, JSON.stringify(datos.slice(0, 15)));
        }
    } catch (e) {
        console.error("Error peso", e);
        if (!cacheLocal.length) {
            cuerpo.innerHTML = "<tr><td colspan='4'>No se pudo cargar el historial</td></tr>";
        }
    }
}

function renderizarGrafico(datos) {
    // datos: [usuario_id(0), fecha(1), peso(2), diferencia(3)]
    const ctx = document.getElementById('graficoPeso');
    if (!ctx || typeof Chart === 'undefined') return;
    if (graficoPesoInstancia) graficoPesoInstancia.destroy();
    graficoPesoInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.map(f => formatearFechaES(f[1] || '')),
            datasets: [{
                label: 'Peso',
                data: datos.map(f => parseFloat(f[2])),
                borderColor: '#78a978',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(120, 169, 120, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

/* --- 5. GENERACIÓN DE INFORME PDF --- */
async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fechaReporte = new Date().toLocaleDateString('es-ES');
    
    doc.setFillColor(120, 169, 120);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("INFORME DE EVOLUCIÓN NUTRAFIT", 20, 25);
    
    doc.setFontSize(10);
    doc.text(`Fecha del informe: ${fechaReporte}`, 20, 33);

    const canvas = document.getElementById('graficoPeso');
    if (canvas) {
        const imgData = canvas.toDataURL("image/png");
        doc.setTextColor(100);
        doc.setFontSize(14);
        doc.text("Progreso Visual del Peso:", 20, 50);
        doc.addImage(imgData, 'PNG', 15, 55, 180, 80);
    }

    let yTabla = 150;
    doc.setFontSize(14);
    doc.setTextColor(120, 169, 120);
    doc.text("Historial Detallado:", 20, yTabla);
    
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    yTabla += 10;
    doc.text("Fecha", 25, yTabla);
    doc.text("Peso (kg)", 80, yTabla);
    doc.text("Diferencia", 130, yTabla);
    
    doc.line(20, yTabla + 2, 190, yTabla + 2);
    yTabla += 8;
    
    doc.setFont("helvetica", "normal");
    const tablaPeso = document.getElementById('tabla-peso-body');
    if (tablaPeso && !tablaPeso.innerText.includes("registros")) {
        const filas = Array.from(tablaPeso.rows).slice(0, 8); 
        filas.forEach(fila => {
            doc.text(fila.cells[0].innerText, 25, yTabla);
            doc.text(fila.cells[1].innerText, 80, yTabla);
            doc.text(fila.cells[2].innerText, 130, yTabla);
            yTabla += 7;
        });
    }

    const imcValue = document.getElementById('valor-imc')?.innerText || "--";
    const imcEstado = document.getElementById('estado-imc')?.innerText || "--";
    
    yTabla += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yTabla, 170, 15, 'F');
    doc.setFont("helvetica", "bold");
    doc.text(`IMC Actual: ${imcValue} - Estado: ${imcEstado}`, 25, yTabla + 10);

    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150);
    doc.text("Nutrafit App - Tu asistente personal de salud", 105, 285, null, null, "center");

    doc.save(`Nutrafit_Evolucion_${fechaReporte}.pdf`);
}

/* --- 6. LÓGICA DE ALIMENTOS Y DESPENSA --- */
function ajustarMacroAlimento(id, inc) {
    const el = document.getElementById(id);
    if (!el) return;
    let val = parseFloat(el.value) || 0;
    el.value = Math.max(0, val + inc).toFixed(2);
    recalcularAlimento();
}

function recalcularAlimento() {
    const prot = parseFloat(document.getElementById('alim-prot').value) || 0;
    const carb = parseFloat(document.getElementById('alim-carb').value) || 0;
    const gras = parseFloat(document.getElementById('alim-gras').value) || 0;
    const fibra = parseFloat(document.getElementById('alim-fibra').value) || 0;
    
    const resultadoBruto = (gras * 0.15) + (carb * 0.12) + (prot * 0.05) - (fibra * 0.01);
    const resultadoRedondeado = Math.round(resultadoBruto);
    
    const campoCalc = document.getElementById('alim-calc');
    if (campoCalc) campoCalc.value = Math.max(0, resultadoRedondeado).toFixed(0); 
}

async function guardarEnDespensa() {
    const nombre = document.getElementById('alim-nombre').value;
    if(!nombre) return alert("Por favor, escribe el nombre del alimento");

    const manualVal = document.getElementById('alim-manual').value;
    const manual = manualVal ? Math.round(parseFloat(manualVal)) : 0;
    const calculado = parseInt(document.getElementById('alim-calc').value) || 0;
    const neto = manual > 0 ? manual : calculado;

    const datos = {
        tipo: "guardar_alimento",
        nombre: nombre,
        grupo: document.getElementById('alim-grupo').value,
        proteinas: document.getElementById('alim-prot').value,
        carbohidratos: document.getElementById('alim-carb').value,
        grasas: document.getElementById('alim-gras').value,
        fibra: document.getElementById('alim-fibra').value,
        manual: manual,
        calculado: calculado,
        neto: Math.round(neto) 
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("✅ " + nombre + " guardado.");
        limpiarFormAlimento();
    } catch (e) { alert("Error al guardar"); }
}

function limpiarFormAlimento() {
    const campos = ['alim-nombre', 'alim-prot', 'alim-carb', 'alim-gras', 'alim-fibra', 'alim-manual', 'alim-calc'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(id === 'alim-calc' || id === 'alim-manual') el.value = "0";
            else if(el.type === 'number') el.value = "0.00";
            else el.value = "";
        }
    });
}

/* --- 7. CARGA Y BUSCADOR DE DESPENSA --- */
async function cargarDespensa() {
    const contenedor = document.getElementById('lista-alimentos-agrupados');
    if(!contenedor) return;

    try {
        const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=alimentos&t=" + new Date().getTime());
        const datos = await res.json();
        
        if (!datos || datos.length === 0) {
            contenedor.innerHTML = "<p style='text-align:center; padding:20px;'>La despensa está vacía.</p>";
            return;
        }

        const grupos = {};
        datos.forEach(fila => {
            const nombreGrupo = fila[1];
            if(nombreGrupo) {
                if(!grupos[nombreGrupo]) grupos[nombreGrupo] = [];
                grupos[nombreGrupo].push(fila);
            }
        });

        const nombresGruposOrdenados = Object.keys(grupos).sort();
        let htmlFinal = "";
        nombresGruposOrdenados.forEach(nombreG => {
            htmlFinal += `
                <div class="grupo-despensa-seccion">
                    <div class="cabecera-grupo-despensa">${nombreG}</div>
                    <table class="tabla-despensa">
                        ${grupos[nombreG].map(a => `
                            <tr class="fila-alimento">
                                <td><b>${a[0]}</b></td>
                                <td style="text-align:right">
                                    <span class="credito-badge">${Math.round(parseFloat(a[8]))} créd.</span>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>`;
        });
        contenedor.innerHTML = htmlFinal;
    } catch (e) { console.error("Error despensa", e); }
}

function filtrarDespensa() {
    const textoBusqueda = document.getElementById('buscador-despensa').value.toLowerCase();
    const filas = document.querySelectorAll('.fila-alimento');
    filas.forEach(fila => {
        const nombreAlimento = fila.innerText.toLowerCase();
        fila.style.display = nombreAlimento.includes(textoBusqueda) ? "" : "none";
    });
}

const DESPENSA_CACHE_KEY = 'nutrafit_despensa_cache_v1';
const DESPENSA_REFRESH_MS = 60000;
const DESPENSA_DATALIST_ID = 'despensa-opciones-diario';
let despensaRefreshInterval = null;
let catalogoDespensaDiario = [];
let indiceDespensaDiario = new Map();

function normalizarTextoDespensa(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function actualizarCatalogoDespensaDiario(items) {
    const lista = Array.isArray(items) ? items : [];
    catalogoDespensaDiario = lista
        .map(item => ({
            nombre: String(item.nombre || '').trim(),
            puntos: Math.round(parseFloat(item.puntos) || 0)
        }))
        .filter(item => item.nombre !== '');

    indiceDespensaDiario = new Map();
    catalogoDespensaDiario.forEach(item => {
        const clave = normalizarTextoDespensa(item.nombre);
        if (!clave || indiceDespensaDiario.has(clave)) return;
        indiceDespensaDiario.set(clave, item);
    });

    const inputActivo = document.activeElement;
    if (inputActivo && inputActivo.matches && inputActivo.matches('.input-txt')) {
        actualizarOpcionesDatalistDespensa(inputActivo);
    }
}

function asegurarDatalistDespensaDiario() {
    let datalist = document.getElementById(DESPENSA_DATALIST_ID);
    if (datalist) return datalist;

    datalist = document.createElement('datalist');
    datalist.id = DESPENSA_DATALIST_ID;
    document.body.appendChild(datalist);
    return datalist;
}

function obtenerCoincidenciasDespensa(texto, maximo = 30) {
    const criterio = normalizarTextoDespensa(texto);
    if (!criterio) {
        return catalogoDespensaDiario.slice(0, maximo);
    }

    return catalogoDespensaDiario
        .filter(item => normalizarTextoDespensa(item.nombre).includes(criterio))
        .slice(0, maximo);
}

function actualizarOpcionesDatalistDespensa(inputTxt) {
    if (!inputTxt || !inputTxt.matches || !inputTxt.matches('.input-txt')) return;

    const datalist = asegurarDatalistDespensaDiario();
    datalist.innerHTML = '';

    const coincidencias = obtenerCoincidenciasDespensa(inputTxt.value, 30);
    coincidencias.forEach(item => {
        const option = document.createElement('option');
        option.value = item.nombre;
        option.label = `${item.nombre} (${item.puntos} pts)`;
        datalist.appendChild(option);
    });

    inputTxt.setAttribute('list', DESPENSA_DATALIST_ID);
}

function aplicarCreditoAutomaticoDespensa(inputTxt) {
    if (!inputTxt) return;

    const nombre = String(inputTxt.value || '').trim();
    const match = indiceDespensaDiario.get(normalizarTextoDespensa(nombre));
    if (!match) return;

    const fila = inputTxt.closest('.fila-ingrediente');
    const inputPts = fila ? fila.querySelector('.input-pts') : null;
    if (!inputPts) return;

    const puntosSugeridos = String(match.puntos || 0);
    if (inputPts.value !== puntosSugeridos) {
        inputPts.value = puntosSugeridos;
        actualizarPuntos();
    }
}

function prepararInputIngredienteDiario(inputTxt) {
    if (!inputTxt) return;
    inputTxt.setAttribute('list', DESPENSA_DATALIST_ID);
    inputTxt.setAttribute('autocomplete', 'off');
}

function inicializarAutocompleteDespensaDiario(root = document) {
    asegurarDatalistDespensaDiario();
    root.querySelectorAll('.input-txt').forEach(prepararInputIngredienteDiario);
}

function leerCacheDespensaDiario() {
    try {
        const raw = localStorage.getItem(DESPENSA_CACHE_KEY);
        if (!raw) return [];
        const cache = JSON.parse(raw);
        return Array.isArray(cache.items) ? cache.items : [];
    } catch (_) {
        return [];
    }
}

function guardarCacheDespensaDiario(items) {
    const payload = {
        updatedAt: Date.now(),
        items: Array.isArray(items) ? items : []
    };
    localStorage.setItem(DESPENSA_CACHE_KEY, JSON.stringify(payload));
}

function renderizarDespensaDiario(items) {
    const contenedor = document.getElementById('lista-despensa');
    if (!contenedor) return;

    if (!Array.isArray(items) || items.length === 0) {
        contenedor.innerHTML = "<p style='text-align:center; padding:20px;'>La despensa está vacía.</p>";
        return;
    }

    const htmlItems = items.map(item => {
        const nombre = String(item.nombre || '').trim();
        const puntos = Math.round(parseFloat(item.puntos) || 0);
        return `
            <div class="item-despensa" data-nombre="${nombre.replace(/"/g, '&quot;')}" data-puntos="${puntos}">
                <span>${nombre}</span>
                <span class="pts-tag">${puntos} pts</span>
            </div>`;
    }).join('');

    contenedor.innerHTML = htmlItems;
    inicializarSeleccionDespensaDiario();
}

async function refrescarDespensaDiario(mostrarErrorEnPantalla = false) {
    const contenedor = document.getElementById('lista-despensa');

    try {
        const urlFetch = URL_GOOGLE_SCRIPT + "?tabla=alimentos&t=" + Date.now();
        const res = await fetch(urlFetch);
        if (!res.ok) throw new Error("HTTP error! status: " + res.status);

        const payload = await res.json();
        const datos = extraerFilasRespuestaGoogle(payload);
        const mensajeBackend = extraerMensajeErrorGoogle(payload);

        if (!Array.isArray(datos) || datos.length === 0) {
            if (mensajeBackend && mostrarErrorEnPantalla && contenedor) {
                contenedor.innerHTML = `<p style='text-align:center; padding:20px; color:red;'>Error de Google Sheets: ${mensajeBackend}</p>`;
            } else if (mostrarErrorEnPantalla && contenedor) {
                contenedor.innerHTML = "<p style='text-align:center; padding:20px;'>La despensa está vacía.</p>";
            }
            return;
        }

        const items = datos.map(fila => ({
            nombre: fila[0],
            puntos: Math.round(parseFloat(fila[8]) || 0)
        }));

        guardarCacheDespensaDiario(items);
        actualizarCatalogoDespensaDiario(items);
        if (contenedor) {
            renderizarDespensaDiario(items);
        }
    } catch (e) {
        console.error("Error cargando despensa en diario:", e);
        if (mostrarErrorEnPantalla && contenedor) {
            contenedor.innerHTML = `<p style='text-align:center; padding:20px; color:red;'>Error: ${e.message}</p>`;
        }
    }
}

function iniciarRefrescoDespensaDiario() {
    if (despensaRefreshInterval) {
        clearInterval(despensaRefreshInterval);
    }

    despensaRefreshInterval = setInterval(() => {
        if (vistaActual !== 'diario-formulario') return;
        refrescarDespensaDiario(false);
    }, DESPENSA_REFRESH_MS);
}

/* --- NUEVA FUNCIÓN PARA CARGAR DESPENSA EN DIARIO-FORMULARIO --- */
async function cargarDespensaDiario() {
    const contenedor = document.getElementById('lista-despensa');
    cargarSemanaActiva();
    inicializarAutocompleteDespensaDiario(document);

    // Pintado instantáneo desde caché local para evitar esperas.
    const cache = leerCacheDespensaDiario();
    actualizarCatalogoDespensaDiario(cache);
    if (cache.length > 0) {
        if (contenedor) {
            renderizarDespensaDiario(cache);
        }
        refrescarDespensaDiario(false);
    } else {
        if (contenedor) {
            contenedor.innerHTML = '<div style="padding:15px; color:gray;"><i class="fas fa-spinner fa-spin"></i> Cargando despensa...</div>';
        }
        await refrescarDespensaDiario(Boolean(contenedor));
    }

    // Refresco en segundo plano cada 60 segundos.
    iniciarRefrescoDespensaDiario();
}
/* --- 8. LÓGICA DE LISTA DE COMPRA (DISEÑO IMAGEN 3) --- */
let listaCompra = [];
let claveListaCompraActual = null;

function obtenerClaveListaCompraUsuario() {
    const uid = (usuarioActivo || localStorage.getItem('nutrafit_usuario_id') || 'anonimo').toLowerCase();
    return `nutrafit_lista_compra_${uid}`;
}

function sincronizarListaCompraUsuario() {
    const nuevaClave = obtenerClaveListaCompraUsuario();
    if (claveListaCompraActual === nuevaClave) return;

    claveListaCompraActual = nuevaClave;
    listaCompra = JSON.parse(localStorage.getItem(claveListaCompraActual) || '[]');
}

function agregarItemCompra() {
    sincronizarListaCompraUsuario();

    const inputNombre = document.getElementById('item-nombre');
    const inputCantidad = document.getElementById('item-cantidad');
    
    if (!inputNombre || !inputCantidad) return;

    const nombre = inputNombre.value.trim();
    const cantidad = inputCantidad.value.trim() || "1";

    if (!nombre) {
        alert("Por favor, escribe un alimento");
        return;
    }

    const nuevoItem = {
        id: Date.now(),
        nombre: nombre,
        cantidad: cantidad,
        comprado: false
    };

    listaCompra.push(nuevoItem);
    
    // Limpiar inputs y devolver foco
    inputNombre.value = "";
    inputCantidad.value = "";
    inputNombre.focus();
    
    actualizarInterfazCompra();
}

function toggleComprado(id) {
    sincronizarListaCompraUsuario();

    const item = listaCompra.find(i => i.id === id);
    if (item) {
        item.comprado = !item.comprado;
        actualizarInterfazCompra();
    }
}

function eliminarItemCompra(id) {
    sincronizarListaCompraUsuario();

    // No preguntamos para eliminar uno solo para que sea ágil, como en la imagen
    listaCompra = listaCompra.filter(i => i.id !== id);
    actualizarInterfazCompra();
}

function limpiarListaCompra() {
    sincronizarListaCompraUsuario();

    if (listaCompra.length === 0) return;
    if (confirm("¿Deseas vaciar toda la lista de la compra?")) {
        listaCompra = [];
        actualizarInterfazCompra();
    }
}

function actualizarInterfazCompra() {
    sincronizarListaCompraUsuario();

    const contenedor = document.getElementById('lista-compra-items');
    const progreso = document.getElementById('progreso-compra');
    
    if (!contenedor) return;

    // Sincronizar con almacenamiento local (Persistencia)
    localStorage.setItem(claveListaCompraActual, JSON.stringify(listaCompra));

    // Ordenar: Pendientes arriba (A-Z) y Comprados abajo
    listaCompra.sort((a, b) => {
        if (a.comprado !== b.comprado) return a.comprado ? 1 : -1;
        return a.nombre.localeCompare(b.nombre);
    });

    if (listaCompra.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align:center; color:#bbb; padding:40px;">
                <i class="fas fa-shopping-basket" style="font-size: 3em; opacity: 0.2;"></i>
                <p style="margin-top:10px;">La lista está vacía</p>
            </div>`;
        if (progreso) progreso.innerText = "0 artículos";
        return;
    }

    // Renderizado estilo Imagen 3
    contenedor.innerHTML = listaCompra.map(item => `
        <div class="item-compra ${item.comprado ? 'comprado' : ''}">
            <div class="icono-item">
                <i class="fas fa-apple-alt" style="opacity:0.2"></i>
            </div>
            
            <div class="info-item">
                <span class="nombre-p">${item.nombre}</span>
                <span class="cantidad-p">${item.cantidad}</span>
            </div>

            <div class="acciones-item">
                <button class="btn-borrar-u" onclick="eliminarItemCompra(${item.id})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
                <input type="checkbox" class="check-c" 
                    ${item.comprado ? 'checked' : ''} 
                    onchange="toggleComprado(${item.id})">
            </div>
        </div>
    `).join('');

    // Actualizar contador
    if (progreso) {
        const total = listaCompra.length;
        const listos = listaCompra.filter(i => i.comprado).length;
        progreso.innerHTML = `<i class="fas fa-check-circle"></i> ${listos} de ${total} comprados`;
    }
}
/* ============================================================
    CONTROL TOTAL NUTRAFIT - ANTONIO (SISTEMA NAVEGADOR GPS)
   ============================================================ */

let actividadActual = 'Caminar';
let imagenParaEnviar = null;

// --- NUEVO: ESCUCHAR DATOS DESDE EL IFRAME GPS (SISTEMA DE MENSAJERÍA) ---
window.addEventListener('message', function(event) {
    const d = event.data;
    if (d.tipo === 'RUTA_FINALIZADA') {
        // Inyectamos los valores capturados del GPS directamente en los inputs
        if(document.getElementById('ej-distancia')) document.getElementById('ej-distancia').value = d.distancia;
        if(document.getElementById('ej-tiempo')) document.getElementById('ej-tiempo').value = d.tiempo;
        if(document.getElementById('ej-pasos')) document.getElementById('ej-pasos').value = d.pasos;
        if(document.getElementById('ej-desnivel')) document.getElementById('ej-desnivel').value = d.desnivel;
        
        // Cerramos el contenedor del mapa automáticamente
        cerrarGpsMini();
        alert("📊 ¡Datos de tu ruta importados correctamente!");
    }
});

// --- 1. IMPORTACIÓN AUTOMÁTICA DESDE EL GPS (PARA CARGA TRADICIONAL) ---
window.addEventListener('load', () => {
    const gpsDist = localStorage.getItem('gps_distancia');
    
    if (gpsDist) {
        if(document.getElementById('ej-distancia')) document.getElementById('ej-distancia').value = gpsDist;
        if(document.getElementById('ej-tiempo')) document.getElementById('ej-tiempo').value = localStorage.getItem('gps_tiempo');
        if(document.getElementById('ej-pasos')) document.getElementById('ej-pasos').value = localStorage.getItem('gps_pasos');
        if(document.getElementById('ej-desnivel')) document.getElementById('ej-desnivel').value = localStorage.getItem('gps_desnivel');

        localStorage.removeItem('gps_distancia');
        localStorage.removeItem('gps_tiempo');
        localStorage.removeItem('gps_pasos');
        localStorage.removeItem('gps_desnivel');
        
        alert("📊 ¡Datos de tu ruta importados correctamente!");
    }
});

// --- 2. CONTADORES Y CARGA DE HISTORIAL ---
setInterval(() => {
    const lista = document.getElementById('lista-actividades-historial');
    if (lista && lista.innerHTML.trim() === "") {
        cargarHistorialEjercicios();
    }
}, 1500);

// --- 3. CÁLCULO MANUAL DE PASOS (Si se edita la distancia a mano) ---
document.addEventListener('input', function (e) {
    if (e.target.id === 'ej-distancia') {
        let valor = e.target.value.replace(',', '.'); 
        const km = parseFloat(valor);
        if (!isNaN(km)) {
            const pasos = Math.round((km * 1000) / 0.65);
            document.getElementById('ej-pasos').value = pasos;
        }
    }
});

// --- 4. FUNCIONES DE CÁMARA Y CAPTURA ---
function intentarHacerFoto() {
    const input = document.getElementById('input-captura');
    if (input) { 
        input.setAttribute('capture', 'environment'); 
        input.click(); 
    }
}

function intentarSubirCaptura() {
    const input = document.getElementById('input-captura');
    if (input) { 
        input.removeAttribute('capture'); 
        input.click(); 
    }
}

function previsualizarImagen(input) {
    if (input.files && input.files[0]) {
        const lector = new FileReader();
        lector.onload = e => {
            imagenParaEnviar = e.target.result.split(',')[1];
            const vistaPrevia = document.getElementById('img-previa');
            if(vistaPrevia) {
                vistaPrevia.src = e.target.result;
                document.getElementById('previsualizacion-contenedor').style.display = 'block';
            }
        };
        lector.readAsDataURL(input.files[0]);
    }
}

function quitarImagen() {
    imagenParaEnviar = null;
    document.getElementById('input-captura').value = "";
    document.getElementById('previsualizacion-contenedor').style.display = 'none';
}

// --- 5. SELECTORES DE ACTIVIDAD ---
function seleccionarActividad(tipo) {
    actividadActual = tipo;
    document.querySelectorAll('.btn-actividad-selector').forEach(btn => btn.classList.remove('activo'));
    if (tipo === 'Caminar') document.getElementById('btn-walk').classList.add('activo');
    if (tipo === 'Ciclismo') document.getElementById('btn-bike').classList.add('activo');
    if (tipo === 'Gimnasio') document.getElementById('btn-gym').classList.add('activo');
}

// --- 6. CARGAR HISTORIAL DESDE GOOGLE SHEETS ---
function pintarHistorialEjercicios(contenedor, resumenMinutos, datos) {
    // Columnas: [usuario_id, fecha, actividad, tiempo, foto, distancia, pasos, desnivel, vel_media]
    let minutosTotalesHoy = 0;
    const hoyFecha = new Date().toISOString().split('T')[0];
    contenedor.innerHTML = "";

    if (!Array.isArray(datos) || datos.length === 0) {
        contenedor.innerHTML = "<div style='padding:12px; color:#666;'>Sin actividades registradas</div>";
        if (resumenMinutos) resumenMinutos.innerText = "0 min";
        return;
    }

    datos.forEach(fila => {
        const fechaRaw = String(fila[1] || "");
        const fechaIso = fechaRaw.includes('T') ? fechaRaw.split('T')[0] : fechaRaw;
        const fechaVista = formatearFechaES(fechaIso);
        if (fechaIso === hoyFecha) {
            minutosTotalesHoy += parseFloat(fila[3] || 0);
        }

        const actividad = String(fila[2] || "Actividad");
        const tiempo = parseFloat(fila[3] || 0) || 0;
        const imagen = fila[4];
        const dist = parseFloat(fila[5] || 0) || 0;
        const pasos = parseInt(fila[6] || 0, 10) || 0;
        const desnivel = parseFloat(fila[7] || 0) || 0;
        const vel = parseFloat(fila[8] || 0) || 0;

        const card = document.createElement('div');
        card.className = "tarjeta-actividad-final";

        let htmlImagen = '';
        if (imagen && String(imagen).startsWith('data:image')) {
            htmlImagen = `
                <div style="background:#000; width:100%; text-align:center; padding:5px; box-sizing:border-box;">
                    <img src="${imagen}" style="width:100%; max-height:300px; object-fit:contain; display:block; border-radius:8px;">
                </div>`;
        }

        const datosCompartir = {
            act: actividad,
            dist: dist,
            tiempo: tiempo,
            vel: vel
        };
        const jsonDatos = JSON.stringify(datosCompartir).replace(/"/g, '&quot;');
        const rowId = fila[9] !== undefined ? String(fila[9]) : '';

        card.innerHTML = `
            <div class="cabecera-card" style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <strong>${actividad.toUpperCase()}</strong>
                    <small>${fechaVista}</small>
                </div>
                <button onclick="compartirActividad('${jsonDatos}')" class="btn-compartir-mini">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button onclick="eliminarRegistroEjercicio('${rowId}', '${fechaRaw.replace(/'/g, "")}', '${actividad.replace(/'/g, "")}')" title="Eliminar actividad" class="btn-compartir-mini" style="color:#e74c3c; margin-left:6px;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
            ${htmlImagen}
            <div class="bloque-blanco-datos">
                <div class="dato-celda"><label>DISTANCIA</label><span>${dist} KM</span></div>
                <div class="dato-celda"><label>TIEMPO</label><span>${tiempo} MIN</span></div>
                <div class="dato-celda"><label>DESNIVEL</label><span>${desnivel} M</span></div>
                <div class="dato-celda"><label>PASOS</label><span>${pasos}</span></div>
            </div>
            <div class="franja-velocidad">VEL. MEDIA: ${vel} KM/H</div>
        `;
        contenedor.appendChild(card);
    });

    if (resumenMinutos) resumenMinutos.innerText = minutosTotalesHoy + " min";
}

async function cargarHistorialEjercicios() {
    const contenedor = document.getElementById('lista-actividades-historial');
    const resumenMinutos = document.getElementById('minutos-hoy-resumen');
    if (!contenedor) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) {
        contenedor.innerHTML = "<div style='padding:12px; color:#666;'>Sin sesión activa</div>";
        if (resumenMinutos) resumenMinutos.innerText = "0 min";
        return;
    }
    if (!usuarioActivo) usuarioActivo = uid;

    const cacheKey = `ejercicio_nutrafit_${uid.toLowerCase()}`;
    const cacheLocal = JSON.parse(localStorage.getItem(cacheKey) || '[]');

    // 1) Pintado instantáneo desde caché local
    if (cacheLocal.length > 0) {
        pintarHistorialEjercicios(contenedor, resumenMinutos, cacheLocal);
    }

    // 2) Refresco desde backend
    try {
        const query = new URLSearchParams({ tabla: "ejercicio", usuario_id: uid, t: String(Date.now()) });
        const respuesta = await fetch(`${URL_GOOGLE_SCRIPT}?${query.toString()}`);
        const datos = await respuesta.json();
        pintarHistorialEjercicios(contenedor, resumenMinutos, datos);
        localStorage.setItem(cacheKey, JSON.stringify(Array.isArray(datos) ? datos.slice(0, 20) : []));
    } catch (error) {
        console.log("Error cargando historial");
        if (!cacheLocal.length) {
            contenedor.innerHTML = "<div style='padding:12px; color:#666;'>No se pudo cargar el historial</div>";
        }
    }
}

// --- 7b. ELIMINAR REGISTRO DE EJERCICIO ---
async function eliminarRegistroEjercicio(rowId, fecha, actividad) {
    if (!confirm('¿Eliminar esta actividad del historial?')) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');
    if (!uid || !did) return alert('No hay sesión activa. Vuelve a identificarte.');

    try {
        const payload = {
            tipo: 'eliminar_ejercicio',
            usuario_id: uid,
            dispositivo_id: did,
            row_id: rowId || '',
            fecha: fecha || '',
            actividad: actividad || ''
        };

        const resp = await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', body: JSON.stringify(payload) });
        const txt = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        // Actualizar caché local: eliminar por rowId o por fecha+actividad
        const cacheKey = `ejercicio_nutrafit_${uid.toLowerCase()}`;
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const nuevoCache = cache.filter(f => {
            if (!Array.isArray(f)) return true;
            const mismoRow = String(f[9] || '') && String(f[9] || '') === String(rowId || '');
            const mismaFirma = String(f[1] || '').startsWith(String(fecha || '').substring(0, 10))
                && String(f[2] || '').trim() === String(actividad || '').trim();
            return !(mismoRow || mismaFirma);
        });
        localStorage.setItem(cacheKey, JSON.stringify(nuevoCache));

        cargarHistorialEjercicios();
    } catch (e) {
        console.error('Error eliminando ejercicio', e);
        alert('No se pudo eliminar: ' + (e.message || e));
    }
}

// --- 7. COMPARTIR EN REDES ---
function compartirActividad(json) {
    const d = JSON.parse(json);
    const texto = `¡Entrenamiento completado en NutraFit! 💪\n\n🏃 Actividad: ${d.act}\n📏 Distancia: ${d.dist} KM\n⏱️ Tiempo: ${d.tiempo} MIN\n🚀 Velocidad: ${d.vel} KM/H\n\n#NutraFitAntonio`;

    if (navigator.share) {
        navigator.share({ title: 'Mi Actividad', text: texto }).catch(console.error);
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
}

// --- 8. GUARDAR EN GOOGLE SHEETS ---
async function validarYGuardarEjercicio() {
    const tiempo = document.getElementById('ej-tiempo').value;
    const distanciaOriginal = document.getElementById('ej-distancia').value;
    if (!tiempo || !distanciaOriginal) return alert("Rellena tiempo y distancia.");

    const btn = document.querySelector('.btn-guardar-principal');
    btn.disabled = true;
    btn.innerHTML = "GUARDANDO...";

    const distanciaLimpia = distanciaOriginal.replace(',', '.');
    
    let velMedia = 0;
    if (parseFloat(tiempo) > 0) {
        velMedia = (parseFloat(distanciaLimpia) / (parseFloat(tiempo) / 60)).toFixed(2);
    }

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');
    if (!uid || !did) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> GUARDAR ENTRENAMIENTO';
        return alert("No hay sesión activa. Vuelve a identificarte.");
    }
    if (!usuarioActivo) usuarioActivo = uid;
    if (!dispositivoId) dispositivoId = did;

    const datos = {
        tipo: "guardar_ejercicio",
        usuario_id: uid,
        dispositivo_id: did,
        actividad: actividadActual,
        tiempo: tiempo,
        distancia: distanciaLimpia,
        pasos: document.getElementById('ej-pasos').value,
        desnivel: document.getElementById('ej-desnivel').value || 0,
        velocidad: velMedia,
        imagenBase64: imagenParaEnviar
    };

    try {
        const resp = await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', body: JSON.stringify(datos) });
        const txt = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        // Actualizar caché local inmediatamente
        const cacheKey = `ejercicio_nutrafit_${uid.toLowerCase()}`;
        const fechaIso = new Date().toISOString().split('.')[0];
        const filaNueva = [uid, fechaIso, actividadActual, parseFloat(tiempo) || 0, imagenParaEnviar ? `data:image/jpeg;base64,${imagenParaEnviar}` : "", parseFloat(distanciaLimpia) || 0, document.getElementById('ej-pasos').value || 0, document.getElementById('ej-desnivel').value || 0, parseFloat(velMedia) || 0];
        const cacheActual = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        localStorage.setItem(cacheKey, JSON.stringify([filaNueva, ...cacheActual].slice(0, 20)));

        alert("¡Guardado!");
        reiniciarFormularioEjercicio();
        cargarHistorialEjercicios();
    } catch (e) {
        alert("Error al guardar: " + (e.message || e));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> GUARDAR ENTRENAMIENTO';
    }
}

function reiniciarFormularioEjercicio() {
    document.getElementById('ej-tiempo').value = "0";
    document.getElementById('ej-distancia').value = "0";
    document.getElementById('ej-desnivel').value = "0";
    document.getElementById('ej-pasos').value = "0";
    quitarImagen();
}

// --- 9. NAVEGACIÓN AL GPS (MODIFICADO PARA INTEGRACIÓN EN VENTANA) ---
function abrirGpsTracker() {
    const contenedor = document.getElementById('gps-mini-container');
    const iframe = document.getElementById('iframe-gps');
    const btnGps = document.getElementById('btn-gps-control');
    
    if (contenedor.style.display === 'none' || contenedor.style.display === '') {
        contenedor.style.display = 'block';
        // Cargamos el GPS con el parámetro modo=mini para ajustar su diseño
        iframe.src = "vistas/GPS-Tracker.html?modo=mini"; 
        
        if(btnGps) {
            btnGps.innerHTML = '<i class="fas fa-times"></i> CERRAR MAPA';
            btnGps.style.background = '#666';
        }
    } else {
        cerrarGpsMini();
    }
}

function cerrarGpsMini() {
    const contenedor = document.getElementById('gps-mini-container');
    const iframe = document.getElementById('iframe-gps');
    const btnGps = document.getElementById('btn-gps-control');

    if(contenedor) contenedor.style.display = 'none';
    if(iframe) iframe.src = ""; // Detenemos el GPS para ahorrar batería
    
    if(btnGps) {
        btnGps.innerHTML = '<i class="fas fa-map-marked-alt"></i> USAR GPS EN VIVO';
        btnGps.style.background = '#2196F3';
    }
}
/* ============================================================
   ACCIONES PARA MI LIBRO DE RECETAS (VERSIÓN PREMIUM)
   ============================================================ */

let imagenRecetaBase64 = null;

/** * NAVEGACIÓN Y UTILIDADES */

function abrirFormulario() {
    document.getElementById('seccion-explorar').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';
}

function cerrarTodo() {
    const formulario = document.getElementById('seccion-formulario');
    const modal = document.getElementById('modal-detalle-receta');
    const explorar = document.getElementById('seccion-explorar');

    if (formulario) formulario.style.display = 'none';
    if (modal) modal.style.display = 'none';
    if (explorar) explorar.style.display = 'block';
    
    imagenRecetaBase64 = null;
    const vistaPrevia = document.getElementById('previa-receta-cont');
    if (vistaPrevia) vistaPrevia.style.display = 'none';
}

/** * SISTEMA DE BÚSQUEDA INTELIGENTE */
function filtrarRecetas() {
    const textoBusqueda = document.getElementById('busqueda-recetas').value.toLowerCase();
    const tarjetas = document.querySelectorAll('.tarjeta-receta');

    tarjetas.forEach(tarjeta => {
        const nombre = tarjeta.querySelector('h3').innerText.toLowerCase();
        const categoria = tarjeta.querySelector('span').innerText.toLowerCase();
        
        if (nombre.includes(textoBusqueda) || categoria.includes(textoBusqueda)) {
            tarjeta.style.display = "block";
        } else {
            tarjeta.style.display = "none";
        }
    });
}

/** * GESTIÓN DE IMÁGENES */
function intentarHacerFotoReceta() {
    const input = document.getElementById('input-captura');
    if (input) {
        input.setAttribute('capture', 'environment');
        input.click();
    }
}

function intentarSubirCapturaReceta() {
    const input = document.getElementById('input-captura');
    if (input) {
        input.removeAttribute('capture');
        input.click();
    }
}

function previsualizarImagenReceta(input) {
    if (input.files && input.files[0]) {
        const lector = new FileReader();
        lector.onload = e => {
            imagenRecetaBase64 = e.target.result.split(',')[1];
            const vistaPrevia = document.getElementById('previa-receta-cont');
            if (vistaPrevia) {
                vistaPrevia.src = e.target.result;
                vistaPrevia.style.display = 'block';
            }
        };
        lector.readAsDataURL(input.files[0]);
    }
}

/** * GUARDADO DE DATOS */
async function guardarRecetaJS() {
    const nombre = document.getElementById('form-nombre').value;
    if (!nombre) return alert("Por favor, escribe el nombre de la receta");

    const btn = document.querySelector('.btn-accion-verde');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "GUARDANDO...";

    const datos = {
        tipo: "guardar_receta",
        nombre: nombre,
        categoria: document.getElementById('form-categoria').value,
        ingredientes: document.getElementById('form-ingredientes').value,
        elaboracion: document.getElementById('form-elaboracion').value,
        imagenBase64: imagenRecetaBase64
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });
        alert("¡Receta guardada con éxito!");
        document.getElementById('form-nombre').value = "";
        document.getElementById('form-ingredientes').value = "";
        document.getElementById('form-elaboracion').value = "";
        cerrarTodo();
        const contenedor = document.getElementById('contenedor-cards');
        if (contenedor) contenedor.innerHTML = ""; 
    } catch (e) {
        alert("Error al conectar con el servidor");
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

/** * SISTEMA DE CARGA DINÁMICA */
async function cargarRecetasDesdeExcel() {
    const contenedor = document.getElementById('contenedor-cards');
    if (!contenedor || contenedor.querySelectorAll('.tarjeta-receta').length > 0) return;

    contenedor.innerHTML = `<div id="loader-recetas" style="grid-column: 1/-1; text-align:center; padding: 60px 20px;">
        <i class="fas fa-sync fa-spin" style="color:#78a978; font-size:3rem; margin-bottom:20px;"></i>
        <p style="font-weight:bold; color:#444;">CARGANDO TU RECETARIO</p></div>`;

    try {
        const urlFull = `${URL_GOOGLE_SCRIPT}?tabla=recetas&t=${Date.now()}`;
        const respuesta = await fetch(urlFull);
        const filas = await respuesta.json();
        contenedor.innerHTML = "";

        if (!filas || filas.length === 0) {
            contenedor.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px;">No hay recetas guardadas.</p>`;
            return;
        }

        filas.reverse().forEach(fila => {
            if (!fila[2]) return;
            const nombre = fila[2], imagen = (fila[1] && fila[1].length > 100) ? fila[1] : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';
            const categoria = fila[3] || "Varios", ing = fila[4] || "", elab = fila[5] || "";

            const card = document.createElement('div');
            card.className = 'tarjeta-receta';
            card.innerHTML = `
                <img src="${imagen}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c'">
                <div class="info-tarjeta">
                    <span style="font-size:0.7rem; color:#78a978; font-weight:bold;">${categoria.toUpperCase()}</span>
                    <h3>${nombre}</h3>
                    <button class="btn-ver-receta">VER RECETA</button>
                </div>`;
            card.querySelector('.btn-ver-receta').onclick = () => abrirDetalleReceta(nombre, ing, elab, imagen);
            contenedor.appendChild(card);
        });
    } catch (error) {
        contenedor.innerHTML = `<div style="grid-column: 1/-1; text-align:center;"><p style="color:red;">Error de conexión</p></div>`;
    }
}

setInterval(() => {
    const lista = document.getElementById('contenedor-cards');
    if (lista && lista.innerHTML.trim() === "") cargarRecetasDesdeExcel();
}, 1500);

/** * MODAL DE DETALLE PREMIUM CON ICONOS INTELIGENTES */
function abrirDetalleReceta(nombre, ing, elab, img) {
    document.getElementById('det-nombre').innerText = nombre;
    document.getElementById('det-img-full').src = img;
    document.getElementById('det-elab').innerHTML = String(elab).replace(/\n/g, '<br>');

    const listaIng = String(ing).split(/\n|<br>/);
    let htmlIngredientes = '<ul class="lista-ingredientes-pro">';

    listaIng.forEach(linea => {
        let textoLimpio = linea.replace(/[•\-\*]/g, "").trim();
        if (textoLimpio === "") return;

        let icono = "fa-check-circle";
        const t = textoLimpio.toLowerCase();

        if (t.includes("huevo")) icono = "fa-egg";
        else if (t.includes("aceite")) icono = "fa-tint";
        else if (t.includes("patata") || t.includes("papa")) icono = "fa-seedling";
        else if (t.includes("cebolla") || t.includes("ajo")) icono = "fa-leaf";
        else if (t.includes("pollo") || t.includes("carne") || t.includes("pavo")) icono = "fa-drumstick-bite";
        else if (t.includes("leche") || t.includes("queso") || t.includes("yogur")) icono = "fa-cheese";
        else if (t.includes("pan") || t.includes("harina") || t.includes("avena")) icono = "fa-bread-slice";
        else if (t.includes("sal") || t.includes("pimienta") || t.includes("especia")) icono = "fa-mortar-pestle";
        else if (t.includes("agua")) icono = "fa-faucet";
        else if (t.includes("tomate") || t.includes("verdura") || t.includes("ensalada")) icono = "fa-apple-alt";

        htmlIngredientes += `<li><i class="fas ${icono}"></i> ${textoLimpio}</li>`;
    });

    htmlIngredientes += '</ul>';
    document.getElementById('det-ing').innerHTML = htmlIngredientes;

    document.getElementById('modal-detalle-receta').style.display = 'block';
}

/**
 * FUNCIÓN PARA COMPARTIR RECETA (SOLO TEXTO - MÁXIMA COMPATIBILIDAD)
 */
async function compartirReceta() {
    const nombre = document.getElementById('det-nombre').innerText;
    
    const listaIngredientes = document.querySelectorAll('.lista-ingredientes-pro li');
    let ingredientesTexto = "";
    listaIngredientes.forEach(li => {
        ingredientesTexto += `• ${li.innerText}\n`;
    });

    const elaboracionTexto = document.getElementById('det-elab').innerText;

    const mensaje = `🥗 *RECETA NUTRAFIT: ${nombre.toUpperCase()}* 🥗\n\n` +
                    `🛒 *INGREDIENTES:*\n${ingredientesTexto}\n` +
                    `👩‍🍳 *ELABORACIÓN:*\n${elaboracionTexto}\n\n` +
                    `_Compartido desde mi Libro de Recetas NutraFit_`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Receta: ${nombre}`,
                text: mensaje
            });
        } catch (err) {
            console.log('Error al compartir:', err);
        }
    } else {
        try {
            await navigator.clipboard.writeText(mensaje);
            alert("La receta se ha copiado al portapapeles. ¡Ya puedes pegarla en WhatsApp!");
        } catch (err) {
            alert("No se pudo compartir la receta.");
        }
    }
}

/** * EVENTO PARA LA BÚSQUEDA 
 * Aseguramos que la búsqueda funcione en tiempo real
 */
document.addEventListener('DOMContentLoaded', () => {
    inicializarNavegacionMovil();

    const inputBusqueda = document.getElementById('busqueda-recetas');
    if(inputBusqueda) {
        inputBusqueda.addEventListener('input', filtrarRecetas);
    }
});
/** * CODIGO DIARIO-FORMULARIO */
/* ============================================================
    LOGICA - NUTRAFIT PLANNER (ESTILO AGUA - SIN URLS)
   ============================================================ */

const STORAGE_KEY_DIARIO_FORMULARIO = 'nutrafit_diario_formulario_estado';

function obtenerPrefijoDiarioUsuario() {
    const uid = (usuarioActivo || localStorage.getItem('nutrafit_usuario_id') || 'anonimo').toLowerCase();
    return `diario_nutrafit_${uid}`;
}

function claveDiarioUsuario(sufijo) {
    return `${obtenerPrefijoDiarioUsuario()}_${sufijo}`;
}

function claveEstadoDiarioFormulario() {
    return claveDiarioUsuario('estado_formulario');
}

function claveSemanaGuardada() {
    return claveDiarioUsuario('ultima_semana_guardada');
}

function claveDiaActivoSemana() {
    return claveDiarioUsuario('dia_activo');
}

function clavePresupuestoDia(dia) {
    return claveDiarioUsuario(`presupuesto_${dia}`);
}

function claveDisponibleDia(dia) {
    return claveDiarioUsuario(`disponible_${dia}`);
}

function calcularRestanteDia(dia) {
    const contenedorDia = document.getElementById(dia);
    if (!contenedorDia) return 30;

    let sumaTotal = 0;
    contenedorDia.querySelectorAll('.input-pts').forEach(input => {
        sumaTotal += parseFloat(input.value) || 0;
    });

    const presupuestoGuardado = parseFloat(localStorage.getItem(clavePresupuestoDia(dia)));
    const presupuesto = !isNaN(presupuestoGuardado) ? presupuestoGuardado : 30;
    return Math.round(presupuesto - sumaTotal);
}

function recalcularDisponiblesSemana() {
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach(dia => {
        const restante = calcularRestanteDia(dia);
        localStorage.setItem(claveDisponibleDia(dia), String(restante));
    });
}

window.onload = function() {
    actualizarPuntos();
    cargarDespensaDiario();
    // Cargar historial de semanas
    cargarHistorialSemanas();
    asegurarPapeleraEnFilasDiario();
};

document.addEventListener('input', function(event) {
    const target = event.target;
    if (!target) return;

    if (target.matches('#fecha-inicio')) {
        guardarSemanaSeleccionada();
    }

    if (target.matches('.input-txt')) {
        prepararInputIngredienteDiario(target);
        actualizarOpcionesDatalistDespensa(target);
        aplicarCreditoAutomaticoDespensa(target);
    }

    if (target.matches('.input-txt') || target.matches('.input-pts')) {
        guardarEstadoSemanaLocal();
        actualizarVisibilidadPapelerasDiario();
    }
});

document.addEventListener('focusin', function(event) {
    const target = event.target;
    if (!target || !target.matches || !target.matches('.input-txt')) return;

    prepararInputIngredienteDiario(target);
    actualizarOpcionesDatalistDespensa(target);
});

/**
 * MOTOR DE CARGA: Usa google.script.run (Igual que el agua)
 */
function cargarDespensaGoogle() {
    const contenedor = document.getElementById('lista-despensa');
    
    if (contenedor) {
        contenedor.innerHTML = '<div style="padding:15px; color:gray;">Cargando despensa...</div>';
    }

    // Ejecuta la función que está en tu Código.gs
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler(mostrarAlimentosEnLista)
            .withFailureHandler(function(err) {
                console.error("Error:", err);
                if (contenedor) contenedor.innerHTML = "Error al cargar datos.";
            })
            .obtenerAlimentosDespensa(); 
    }
}

/**
 * RENDERIZADO: Dibuja los datos cuando Google los devuelve
 */
function mostrarAlimentosEnLista(alimentos) {
    const contenedor = document.getElementById('lista-despensa');
    if (!contenedor || !alimentos) return;

    let html = '';
    alimentos.forEach(function(item) {
        // Usamos item.nombre e item.netos (definidos en tu Código.gs)
        html += '<div class="item-despensa">' +
                '<span>' + item.nombre + '</span>' +
                '<span class="pts-tag">' + (item.netos || 0) + ' pts</span>' +
                '</div>';
    });
    
    contenedor.innerHTML = html;
}

/**
 * GESTIÓN DE FILAS DINÁMICAS (LUNES, MARTES, ETC)
 */
function gestionarNuevaFila(inputActual) {
    const contenedor = inputActual.closest('.contenedor-ingredientes');
    if (!contenedor) return;
    
    const todasLasFilas = contenedor.querySelectorAll('.fila-ingrediente');
    const ultimaFila = todasLasFilas[todasLasFilas.length - 1];
    const inputUltimaFila = ultimaFila.querySelector('.input-txt');

    if (inputActual === inputUltimaFila && inputActual.value.trim() !== "") {
        crearFilaNueva(contenedor);
    }
    actualizarPuntos();
}

function crearFilaNueva(contenedor) {
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'fila-ingrediente';
    nuevaFila.innerHTML = '<input type="text" class="input-txt" placeholder="Otro ingrediente..." oninput="gestionarNuevaFila(this)">' +
                          '<button type="button" class="btn-eliminar-fila" onclick="eliminarFilaIngrediente(this)" title="Eliminar línea"><i class="fas fa-trash-alt"></i></button>' +
                          '<input type="number" class="input-pts" value="0" oninput="actualizarPuntos()">';
    contenedor.appendChild(nuevaFila);

    const inputTxt = nuevaFila.querySelector('.input-txt');
    prepararInputIngredienteDiario(inputTxt);
}

function asegurarPapeleraEnFilasDiario() {
    document.querySelectorAll('.fila-ingrediente').forEach(fila => {
        const inputTxt = fila.querySelector('.input-txt');
        const inputPts = fila.querySelector('.input-pts');
        if (!inputTxt || !inputPts) return;

        let botonEliminar = fila.querySelector('.btn-eliminar-fila');
        if (!botonEliminar) {
            botonEliminar = document.createElement('button');
            botonEliminar.type = 'button';
            botonEliminar.className = 'btn-eliminar-fila';
            botonEliminar.title = 'Eliminar línea';
            botonEliminar.innerHTML = '<i class="fas fa-trash-alt"></i>';
            botonEliminar.addEventListener('click', function() {
                eliminarFilaIngrediente(this);
            });
            fila.insertBefore(botonEliminar, inputPts);
        }
    });

    actualizarVisibilidadPapelerasDiario();
}

function actualizarVisibilidadPapelerasDiario() {
    document.querySelectorAll('.contenedor-ingredientes').forEach(contenedor => {
        const filas = Array.from(contenedor.querySelectorAll('.fila-ingrediente'));
        filas.forEach((fila, indice) => {
            const boton = fila.querySelector('.btn-eliminar-fila');
            if (!boton) return;

            const txt = String(fila.querySelector('.input-txt')?.value || '').trim();
            const esPrimeraFila = indice === 0;
            boton.classList.toggle('oculta', !esPrimeraFila && txt === '');
        });
    });
}

function eliminarFilaIngrediente(boton) {
    const fila = boton?.closest('.fila-ingrediente');
    const contenedor = fila?.closest('.contenedor-ingredientes');
    if (!fila || !contenedor) return;

    fila.remove();

    if (contenedor.querySelectorAll('.fila-ingrediente').length === 0) {
        crearFilaNueva(contenedor);
    }

    actualizarPuntos();
    actualizarVisibilidadPapelerasDiario();
    guardarEstadoSemanaLocal();
}

function formatearPuntosMomento(valor) {
    const numero = Math.round((valor + Number.EPSILON) * 10) / 10;
    return Number.isInteger(numero) ? String(numero) : numero.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

function asegurarBadgeMomento(card) {
    if (!card) return null;

    let badge = card.querySelector('.momento-parcial');
    if (badge) return badge;

    const header = card.querySelector('.momento-header');
    if (!header) return null;

    badge = document.createElement('span');
    badge.className = 'momento-parcial';
    badge.textContent = '0 Créd.';
    header.appendChild(badge);
    return badge;
}

function actualizarPuntosPorMomento() {
    document.querySelectorAll('.contenido-dia .card-momento').forEach(card => {
        let subtotal = 0;
        card.querySelectorAll('.input-pts').forEach(input => {
            subtotal += parseFloat(input.value) || 0;
        });

        const badge = asegurarBadgeMomento(card);
        if (badge) {
            badge.textContent = formatearPuntosMomento(subtotal) + ' Créd.';
        }
    });
}

/**
 * CÁLCULO DE PUNTOS
 */
function actualizarPuntos() {
    const diaActivo = document.querySelector('.contenido-dia.active');
    if (!diaActivo) return;

    const inputsPuntos = diaActivo.querySelectorAll('.input-pts');
    let sumaTotal = 0;
    
    inputsPuntos.forEach(function(input) {
        sumaTotal += parseFloat(input.value) || 0;
    });

    const presupuestoInput = document.getElementById('total-' + diaActual);
    const presupuesto = obtenerPresupuestoDiaActual();
    if (presupuestoInput) {
        presupuestoInput.value = String(Math.round(presupuesto));
    }
    const restante = Math.round(presupuesto - sumaTotal);
    localStorage.setItem(claveDisponibleDia(diaActual), String(restante));

    const displayRestante = document.getElementById('restantes-val');
    if (displayRestante) {
        displayRestante.value = restante;
        displayRestante.style.color = restante < 0 ? "#e74c3c" : "#d35400";
    }

    actualizarPuntosPorMomento();
}

/**
 * BUSCADOR
 */
function filtrarDespensaLocal() {
    const input = document.getElementById('busqueda-despensa').value.toLowerCase();
    const items = document.getElementsByClassName('item-despensa');
    
    for (let i = 0; i < items.length; i++) {
        const span = items[i].getElementsByTagName('span')[0];
        if (span) {
            const nombre = span.innerText.toLowerCase();
            items[i].style.display = nombre.includes(input) ? "flex" : "none";
        }
    }
}

/* --- FUNCIONES PARA DIARIO FORMULARIO --- */
let diaActual = 'lunes';
let inputDiarioActivo = null;
let cardMomentoActiva = null;

function inicializarSeleccionDespensaDiario() {
    const contenedor = document.getElementById('lista-despensa');
    if (!contenedor || contenedor.dataset.listenerDespensa === '1') return;

    contenedor.dataset.listenerDespensa = '1';
    contenedor.addEventListener('click', function(event) {
        const item = event.target.closest('.item-despensa');
        if (!item) return;

        const nombre = (item.dataset.nombre || item.querySelector('span')?.innerText || '').trim();
        const puntos = parseFloat(item.dataset.puntos || '0') || 0;
        if (!nombre) return;

        insertarIngredienteDesdeDespensa(nombre, puntos);
    });
}

function obtenerInputObjetivoDiario() {
    const diaActivo = document.querySelector('.contenido-dia.active');
    if (!diaActivo) return null;

    if (inputDiarioActivo && document.body.contains(inputDiarioActivo) && diaActivo.contains(inputDiarioActivo)) {
        return inputDiarioActivo;
    }

    if (cardMomentoActiva && document.body.contains(cardMomentoActiva) && diaActivo.contains(cardMomentoActiva)) {
        const vacioCard = Array.from(cardMomentoActiva.querySelectorAll('.input-txt')).find(i => !String(i.value || '').trim());
        if (vacioCard) return vacioCard;

        const contenedorIngredientes = cardMomentoActiva.querySelector('.contenedor-ingredientes');
        if (contenedorIngredientes) {
            crearFilaNueva(contenedorIngredientes);
            const inputsCard = cardMomentoActiva.querySelectorAll('.input-txt');
            return inputsCard[inputsCard.length - 1] || null;
        }
    }

    const vacioDia = Array.from(diaActivo.querySelectorAll('.input-txt')).find(i => !String(i.value || '').trim());
    if (vacioDia) return vacioDia;

    const primeraCard = diaActivo.querySelector('.card-momento');
    const contenedorIngredientes = primeraCard?.querySelector('.contenedor-ingredientes');
    if (contenedorIngredientes) {
        crearFilaNueva(contenedorIngredientes);
        const inputsDia = diaActivo.querySelectorAll('.input-txt');
        return inputsDia[inputsDia.length - 1] || null;
    }

    return null;
}

function aplicarIngredienteAPosicion(inputTxt, nombreIngrediente, puntosIngrediente) {
    if (!inputTxt) return;

    inputTxt.value = nombreIngrediente;
    const fila = inputTxt.closest('.fila-ingrediente');
    const inputPts = fila ? fila.querySelector('.input-pts') : null;
    if (inputPts) {
        inputPts.value = String(puntosIngrediente || 0);
    }

    inputDiarioActivo = inputTxt;
    cardMomentoActiva = inputTxt.closest('.card-momento');
    gestionarNuevaFila(inputTxt);
    actualizarPuntos();
    guardarEstadoSemanaLocal();
    inputTxt.focus();
}

function insertarIngredienteDesdeDespensa(nombreIngrediente, puntosIngrediente) {
    const inputObjetivo = obtenerInputObjetivoDiario();
    if (!inputObjetivo) {
        alert('No se encontró un campo activo para insertar el ingrediente.');
        return;
    }

    const valorActual = String(inputObjetivo.value || '').trim();
    if (valorActual) {
        const card = inputObjetivo.closest('.card-momento');
        const contenedorIngredientes = card?.querySelector('.contenedor-ingredientes');
        if (contenedorIngredientes) {
            crearFilaNueva(contenedorIngredientes);
            const nuevosInputs = contenedorIngredientes.querySelectorAll('.input-txt');
            const ultimoInput = nuevosInputs[nuevosInputs.length - 1];
            if (ultimoInput) {
                aplicarIngredienteAPosicion(ultimoInput, nombreIngrediente, puntosIngrediente);
                return;
            }
        }
    }

    aplicarIngredienteAPosicion(inputObjetivo, nombreIngrediente, puntosIngrediente);
}

document.addEventListener('focusin', function(event) {
    const target = event.target;
    if (!target || !target.matches || !target.matches('.input-txt')) return;

    const card = target.closest('.card-momento');
    const diaActivo = document.querySelector('.contenido-dia.active');
    if (card && diaActivo && diaActivo.contains(target)) {
        inputDiarioActivo = target;
        cardMomentoActiva = card;
    }
});

document.addEventListener('click', function(event) {
    const card = event.target.closest('.card-momento');
    const diaActivo = document.querySelector('.contenido-dia.active');
    if (card && diaActivo && diaActivo.contains(card)) {
        cardMomentoActiva = card;
    }
});

function cambiarDia(dia, btn) {
    // Remover active
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.contenido-dia').forEach(d => d.classList.remove('active'));
    
    // Agregar active
    btn.classList.add('active');
    document.getElementById(dia).classList.add('active');
    
    // Cambiar id del presupuesto
    const presupuestoInput = document.getElementById('total-' + diaActual);
    presupuestoInput.id = 'total-' + dia;
    
    // Cargar value guardado
    const saved = localStorage.getItem(clavePresupuestoDia(dia));
    if (saved !== null) {
        presupuestoInput.value = saved;
    } else {
        presupuestoInput.value = 30; // default
    }
    
    diaActual = dia;
    localStorage.setItem(claveDiaActivoSemana(), dia);
    guardarEstadoSemanaLocal();

    const disponibleGuardado = parseFloat(localStorage.getItem(claveDisponibleDia(dia)));
    const displayRestante = document.getElementById('restantes-val');
    if (displayRestante && !isNaN(disponibleGuardado)) {
        displayRestante.value = String(Math.round(disponibleGuardado));
        displayRestante.style.color = disponibleGuardado < 0 ? "#e74c3c" : "#d35400";
    }

    actualizarPuntos();
}

function guardarPresupuestoActual() {
    const val = document.getElementById('total-' + diaActual).value;
    localStorage.setItem(clavePresupuestoDia(diaActual), val);
    guardarEstadoSemanaLocal();
}

function guardarEstadoSemanaLocal() {
    const fechaInput = document.getElementById('fecha-inicio');
    const inicioSemana = fechaInput ? fechaInput.value : '';
    const estado = {
        fechaInicio: inicioSemana,
        diaActivo: diaActual,
        filasPorDia: {}
    };

    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach(dia => {
        const contenedorDia = document.getElementById(dia);
        if (!contenedorDia) return;

        estado.filasPorDia[dia] = [];
        contenedorDia.querySelectorAll('.card-momento').forEach(card => {
            const momento = card.querySelector('.momento-titulo')?.innerText.trim() || '';
            const filas = [];

            card.querySelectorAll('.fila-ingrediente').forEach(fila => {
                const ingrediente = fila.querySelector('.input-txt')?.value.trim() || '';
                const puntos = fila.querySelector('.input-pts')?.value.trim() || '0';
                filas.push({ ingrediente, puntos });
            });

            estado.filasPorDia[dia].push({ momento, filas });
        });
    });

    localStorage.setItem(claveEstadoDiarioFormulario(), JSON.stringify(estado));
}

function restaurarEstadoSemanaLocal() {
    const saved = localStorage.getItem(claveEstadoDiarioFormulario());
    if (!saved) return false;

    try {
        const estado = JSON.parse(saved);
        const fechaInput = document.getElementById('fecha-inicio');
        if (fechaInput && estado.fechaInicio) {
            fechaInput.value = estado.fechaInicio;
        }

        if (estado.filasPorDia) {
            Object.keys(estado.filasPorDia).forEach(dia => {
                const contenedorDia = document.getElementById(dia);
                if (!contenedorDia) return;

                const cards = contenedorDia.querySelectorAll('.card-momento');
                const datosDia = estado.filasPorDia[dia] || [];

                datosDia.forEach((datosCard, indexCard) => {
                    const card = cards[indexCard];
                    if (!card) return;
                    const contenedorIngredientes = card.querySelector('.contenedor-ingredientes');
                    if (!contenedorIngredientes) return;

                    contenedorIngredientes.innerHTML = '';
                    datosCard.filas.forEach(filaData => {
                        const fila = document.createElement('div');
                        fila.className = 'fila-ingrediente';

                        const inputTxt = document.createElement('input');
                        inputTxt.type = 'text';
                        inputTxt.className = 'input-txt';
                        inputTxt.placeholder = 'Ingrediente...';
                        inputTxt.value = filaData.ingrediente || '';
                        prepararInputIngredienteDiario(inputTxt);
                        inputTxt.addEventListener('input', function() {
                            gestionarNuevaFila(this);
                            guardarEstadoSemanaLocal();
                        });

                        const inputPts = document.createElement('input');
                        inputPts.type = 'number';
                        inputPts.className = 'input-pts';
                        inputPts.value = filaData.puntos || '0';
                        inputPts.addEventListener('input', function() {
                            actualizarPuntos();
                            guardarEstadoSemanaLocal();
                        });

                        fila.appendChild(inputTxt);
                        fila.appendChild(inputPts);
                        contenedorIngredientes.appendChild(fila);
                    });

                    if (datosCard.filas.length === 0) {
                        const fila = document.createElement('div');
                        fila.className = 'fila-ingrediente';

                        const inputTxt = document.createElement('input');
                        inputTxt.type = 'text';
                        inputTxt.className = 'input-txt';
                        inputTxt.placeholder = 'Ingrediente...';
                        prepararInputIngredienteDiario(inputTxt);
                        inputTxt.addEventListener('input', function() {
                            gestionarNuevaFila(this);
                            guardarEstadoSemanaLocal();
                        });

                        const inputPts = document.createElement('input');
                        inputPts.type = 'number';
                        inputPts.className = 'input-pts';
                        inputPts.value = '0';
                        inputPts.addEventListener('input', function() {
                            actualizarPuntos();
                            guardarEstadoSemanaLocal();
                        });

                        fila.appendChild(inputTxt);
                        fila.appendChild(inputPts);
                        contenedorIngredientes.appendChild(fila);
                    }
                });
            });

            asegurarPapeleraEnFilasDiario();
        }

        if (estado.diaActivo) {
            diaActual = estado.diaActivo;
        }

        recalcularDisponiblesSemana();
        actualizarPuntos();

        return true;
    } catch (error) {
        console.error('Error restaurando estado del diario:', error);
        return false;
    }
}

function guardarSemanaSeleccionada() {
    const fechaInput = document.getElementById('fecha-inicio');
    const inicioSemana = fechaInput ? fechaInput.value : '';
    if (inicioSemana) {
        localStorage.setItem(claveSemanaGuardada(), inicioSemana);
        localStorage.setItem(claveDiaActivoSemana(), diaActual);
        guardarEstadoSemanaLocal();
    }
}

function getTabButton(dia) {
    return document.querySelector('.tab-btn[data-dia="' + dia + '"]');
}

function cargarSemanaActiva() {
    const fechaInput = document.getElementById('fecha-inicio');
    if (fechaInput) {
        fechaInput.addEventListener('change', guardarSemanaSeleccionada);
    }

    const estadoRestaurado = restaurarEstadoSemanaLocal();
    if (estadoRestaurado) {
        const diaA = diaActual || 'lunes';
        const btn = getTabButton(diaA);
        if (btn) {
            cambiarDia(diaA, btn);
        }
        actualizarPuntos();
        return;
    }

    const ultimaSemana = localStorage.getItem(claveSemanaGuardada());
    const diaGuardado = localStorage.getItem(claveDiaActivoSemana());
    if (fechaInput && ultimaSemana) {
        fechaInput.value = ultimaSemana;
    }

    const diaA = diaGuardado || 'lunes';
    const btn = getTabButton(diaA);
    if (btn) {
        cambiarDia(diaA, btn);
    }
}

function calcularFechaParaDia(fechaInicio, dia) {
    if (!fechaInicio) return "";
    const offsetMap = {
        lunes: 0,
        martes: 1,
        miercoles: 2,
        jueves: 3,
        viernes: 4,
        sabado: 5,
        domingo: 6
    };
    const offset = offsetMap[dia] || 0;
    const fecha = parseFechaYMD(fechaInicio);
    if (isNaN(fecha.getTime())) return "";
    fecha.setDate(fecha.getDate() + offset);
    return formatearFechaYMDLocal(fecha);
}

function actualizarSemanaActiva() {
    guardarMenuSemanal('actualizar');
}

function guardarMenuSemanal(modo = 'nuevo') {
    const inicioSemana = document.getElementById('fecha-inicio')?.value || "";
    const presupuestoSemana = obtenerPresupuestoSemanaActual();
    const diaMap = {
        lunes: 'Lunes',
        martes: 'Martes',
        miercoles: 'Miércoles',
        jueves: 'Jueves',
        viernes: 'Viernes',
        sabado: 'Sábado',
        domingo: 'Domingo'
    };
    const dias = Object.keys(diaMap);

    if (!inicioSemana) {
        alert('Debes indicar la fecha de inicio de la semana.');
        return;
    }

    if (modo === 'actualizar') {
        if (!confirm('Vas a actualizar la semana activa en Google Sheets. Se reemplazará lo guardado previamente para esa semana.')) {
            return;
        }
    } else {
        if (!confirm('Vas a guardar una semana nueva. Si esa fecha ya existe, usa Actualizar.')) {
            return;
        }
    }

    const filasGuardar = [];

    dias.forEach(dia => {
        const contenedorDia = document.getElementById(dia);
        if (!contenedorDia) return;

        const cards = contenedorDia.querySelectorAll('.card-momento');
        const fechaDia = calcularFechaParaDia(inicioSemana, dia);

        cards.forEach(card => {
            const momento = card.querySelector('.momento-titulo')?.innerText.trim() || "";
            card.querySelectorAll('.fila-ingrediente').forEach(fila => {
                const ingrediente = fila.querySelector('.input-txt')?.value.trim() || "";
                const puntos = fila.querySelector('.input-pts')?.value.trim() || "";

                if (!ingrediente && !puntos) return;
                if (ingrediente === "" && Number(puntos) === 0) return;

                filasGuardar.push({
                    'Semana inicio': inicioSemana,
                    'Fecha': fechaDia,
                    'Día': diaMap[dia],
                    'Momento': momento,
                    'Ingrediente': ingrediente,
                    'Puntos': puntos,
                    'Presupuesto': presupuestoSemana
                });
            });
        });
    });

    if (filasGuardar.length === 0) {
        return alert('No hay datos para guardar en el menú semanal.');
    }

    const btn = document.getElementById(modo === 'actualizar' ? 'btn-actualizar-menu' : 'btn-guardar-menu');
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    const did = dispositivoId || localStorage.getItem('nutrafit_dispositivo_id');
    if (!uid || !did) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
        return alert('No hay sesión activa. Vuelve a identificarte.');
    }

    fetch(URL_GOOGLE_SCRIPT, {
        method: 'POST',
        body: JSON.stringify({
            tipo: modo === 'actualizar' ? 'actualizar_menu_semanal' : 'guardar_menu_semanal',
            modo: modo,
            usuario_id: uid,
            dispositivo_id: did,
            filas: filasGuardar
        })
    })
    .then(async (resp) => {
        const txt = String(await resp.text()).trim();
        if (!resp.ok || !/exito|éxito/i.test(txt)) throw new Error(txt || `HTTP ${resp.status}`);

        if (inicioSemana) {
            localStorage.setItem(claveSemanaGuardada(), inicioSemana);
            localStorage.setItem(claveDiaActivoSemana(), diaActual);
            guardarEstadoSemanaLocal();
        }
        alert(modo === 'actualizar'
            ? 'Semana activa actualizada: se añadieron solo registros nuevos o modificados.'
            : 'Semana nueva guardada correctamente.');
    })
    .catch((error) => {
        alert('Error al guardar el menú: ' + (error.message || error));
    })
    .finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    });
}

async function limpiarSemana() {
    localStorage.removeItem(claveSemanaGuardada());
    localStorage.removeItem(claveDiaActivoSemana());
    localStorage.removeItem(claveEstadoDiarioFormulario());
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach(dia => {
        localStorage.removeItem(clavePresupuestoDia(dia));
        localStorage.removeItem(claveDisponibleDia(dia));
    });

    reiniciarFormulario();
    const btn = getTabButton('lunes');
    if (btn) cambiarDia('lunes', btn);

    // Al limpiar semana, se considera inicio de nuevo menú: aplicar último crédito calculado.
    await sincronizarPresupuestoConUltimoCredito();

    alert('Semana limpiada. Ahora puedes iniciar una nueva semana.');
}

function reiniciarFormulario() {
    const fechaInput = document.getElementById('fecha-inicio');
    if (fechaInput) fechaInput.value = '';

    document.querySelectorAll('.card-momento').forEach(card => {
        const contenedor = card.querySelector('.contenedor-ingredientes');
        if (!contenedor) return;
        contenedor.innerHTML =
            '<div class="fila-ingrediente">' +
            '<input type="text" class="input-txt" placeholder="Ingrediente..." oninput="gestionarNuevaFila(this); guardarEstadoSemanaLocal();">' +
            '<button type="button" class="btn-eliminar-fila" onclick="eliminarFilaIngrediente(this)" title="Eliminar línea"><i class="fas fa-trash-alt"></i></button>' +
            '<input type="number" class="input-pts" value="0" oninput="actualizarPuntos(); guardarEstadoSemanaLocal();">' +
            '</div>';
    });

    asegurarPapeleraEnFilasDiario();

    document.querySelectorAll('[id^="total-"]').forEach(input => {
        if (input.tagName === 'INPUT') input.value = 30;
    });

    const displayRestante = document.getElementById('restantes-val');
    if (displayRestante) {
        displayRestante.value = 30;
        displayRestante.style.color = '#d35400';
    }
}

function irAlMenu() {
    // Esto funciona dentro de Google Apps Script para recargar la página
    google.script.run.withSuccessHandler(function(url){
        window.open(url, '_top');
    }).getScriptUrl();
}

function obtenerCreditosLunesInforme() {
    const guardado = parseFloat(localStorage.getItem(clavePresupuestoDia('lunes')));
    if (!isNaN(guardado)) return Math.round(guardado);

    const inputLunes = document.getElementById('total-lunes');
    const valorLunes = parseFloat(inputLunes?.value);
    if (!isNaN(valorLunes)) return Math.round(valorLunes);

    const inputActivo = document.getElementById('total-' + diaActual);
    const valorActivo = parseFloat(inputActivo?.value);
    if (!isNaN(valorActivo) && diaActual === 'lunes') return Math.round(valorActivo);

    return 30;
}

function normalizarNombreMomento(valor) {
    const texto = String(valor || '').trim().toLowerCase();
    if (texto === 'almuerzo / mm' || texto === 'almuerzo/mm' || texto === 'media mañana' || texto === 'media manana') {
        return 'media manana';
    }
    return texto;
}

async function cargarImagenComoDataURL(ruta) {
    const response = await fetch(ruta);
    if (!response.ok) {
        throw new Error('No se pudo cargar el logo corporativo.');
    }

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Error convirtiendo el logo.'));
        reader.readAsDataURL(blob);
    });
}

function obtenerDatosSemanaParaPDF() {
    const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const momentos = ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena'];
    const tabla = {};

    dias.forEach(dia => {
        tabla[dia] = {};
        momentos.forEach(momento => {
            tabla[dia][momento] = [];
        });

        const contenedorDia = document.getElementById(dia);
        if (!contenedorDia) return;

        const cards = contenedorDia.querySelectorAll('.card-momento');
        momentos.forEach((momento, idx) => {
            const card = cards[idx];
            if (!card) return;

            const ingredientes = [];
            card.querySelectorAll('.fila-ingrediente').forEach(fila => {
                const ingrediente = fila.querySelector('.input-txt')?.value.trim() || '';
                if (ingrediente) ingredientes.push(ingrediente);
            });

            tabla[dia][momento] = ingredientes;
        });
    });

    return { dias, momentos, tabla };
}

function construirTextoCeldaIngredientes(ingredientes) {
    if (!ingredientes || ingredientes.length === 0) return '-';
    return ingredientes.map(item => '• ' + item).join('\n');
}

async function imprimirSemanaPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('No se ha encontrado la librería para generar PDF.');
        return;
    }

    const fechaLunes = document.getElementById('fecha-inicio')?.value || '';
    if (!fechaLunes) {
        alert('Selecciona la fecha de inicio de semana antes de imprimir.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const verdeCorp = [120, 169, 120];
    const verdeOscuro = [90, 138, 90];
    const grisTexto = [60, 60, 60];

    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const margen = 10;

    doc.setFillColor(...verdeCorp);
    doc.rect(0, 0, ancho, 28, 'F');

    try {
        const logoDataUrl = await cargarImagenComoDataURL('IMAGENES/logo.png');
        doc.addImage(logoDataUrl, 'PNG', 10, 4.5, 20, 20);
    } catch (error) {
        console.warn(error.message);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('NUTRAFIT PLANNER SEMANAL', ancho / 2, 17, { align: 'center' });

    const creditosLunes = obtenerCreditosLunesInforme();
    const fechaLunesFormateada = formatearFechaES(fechaLunes);

    doc.setTextColor(...verdeOscuro);
    doc.setFontSize(11);
    doc.text('Semana (Lunes): ' + fechaLunesFormateada, margen, 37);
    doc.text('Créditos Lunes: ' + creditosLunes + ' Créd.', margen + 85, 37);

    const { dias, momentos, tabla } = obtenerDatosSemanaParaPDF();

    const tablaY = 42;
    const altoCabecera = 10;
    const altoFila = 26;
    const anchoMomento = 30;
    const anchoDia = (ancho - (margen * 2) - anchoMomento) / 7;
    const altoTabla = altoCabecera + (altoFila * momentos.length);

    doc.setDrawColor(190, 210, 190);
    doc.setLineWidth(0.2);

    doc.setFillColor(238, 245, 238);
    doc.rect(margen, tablaY, anchoMomento, altoCabecera, 'F');
    doc.setTextColor(...verdeOscuro);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Momento', margen + 2, tablaY + 6.5);

    const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    dias.forEach((dia, idx) => {
        const x = margen + anchoMomento + (idx * anchoDia);
        doc.setFillColor(238, 245, 238);
        doc.rect(x, tablaY, anchoDia, altoCabecera, 'F');
        doc.setTextColor(...verdeOscuro);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(nombresDias[idx], x + 2, tablaY + 6.5);
    });

    momentos.forEach((momento, row) => {
        const y = tablaY + altoCabecera + (row * altoFila);

        doc.setTextColor(...verdeOscuro);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.rect(margen, y, anchoMomento, altoFila);
        const textoMomento = doc.splitTextToSize(momento, anchoMomento - 3);
        doc.text(textoMomento, margen + 1.7, y + 5.5);

        dias.forEach((dia, col) => {
            const x = margen + anchoMomento + (col * anchoDia);
            doc.rect(x, y, anchoDia, altoFila);

            doc.setTextColor(...grisTexto);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);

            const texto = construirTextoCeldaIngredientes(tabla[dia][momento]);
            const lineas = doc.splitTextToSize(texto, anchoDia - 2.5);
            const lineasRecortadas = lineas.slice(0, 6);
            if (lineas.length > 6) {
                lineasRecortadas[5] = '...';
            }

            doc.text(lineasRecortadas, x + 1.2, y + 4.4, { baseline: 'top' });
        });
    });

    const mensajeY = Math.min(tablaY + altoTabla + 12, alto - 15);
    doc.setTextColor(...verdeOscuro);
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(10);
    const fraseMotivacional = 'La disciplina de hoy es la libertad de mañana: cumple con tu plan y deja que la satisfacción de haberlo logrado sea el motor de tu semana.';
    const fraseLineas = doc.splitTextToSize(fraseMotivacional, ancho - (margen * 2));
    doc.text(fraseLineas, ancho / 2, mensajeY, { align: 'center' });

    doc.save('NutraFit_Semana_' + fechaLunes + '.pdf');
}

/* --- FUNCIONES PARA HISTORIAL DE SEMANAS --- */
function obtenerValorMenuSemanal(fila, campo) {
    const idx = {
        usuario_id: 0,
        semana_inicio: 1,
        fecha: 2,
        dia: 3,
        momento: 4,
        ingrediente: 5,
        puntos: 7,
        presupuesto: 9
    };

    if (Array.isArray(fila)) {
        return fila[idx[campo]];
    }

    const mapaCampos = {
        usuario_id: ['usuario_id', 'usuario id', 'usuario'],
        semana_inicio: ['Semana inicio', 'semana inicio', 'semana_inicio', 'semana'],
        fecha: ['Fecha', 'fecha'],
        dia: ['Día', 'Dia', 'dia'],
        momento: ['Momento', 'momento'],
        ingrediente: ['Ingrediente', 'ingrediente'],
        puntos: ['Puntos', 'puntos'],
        presupuesto: ['Presupuesto', 'presupuesto']
    };

    const claves = mapaCampos[campo] || [];
    for (const clave of claves) {
        if (fila && Object.prototype.hasOwnProperty.call(fila, clave)) {
            return fila[clave];
        }
    }
    return undefined;
}

function obtenerPresupuestoDesdeFila(fila) {
    const presupuesto = parseFloat(obtenerValorMenuSemanal(fila, 'presupuesto'));
    return isNaN(presupuesto) ? null : Math.round(presupuesto);
}

function normalizarDiaMenuAId(diaValor) {
    const texto = String(diaValor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const mapa = {
        lunes: 'lunes',
        martes: 'martes',
        miercoles: 'miercoles',
        jueves: 'jueves',
        viernes: 'viernes',
        sabado: 'sabado',
        domingo: 'domingo'
    };

    return mapa[texto] || '';
}

async function cargarHistorialSemanas() {
    const contenedor = document.getElementById('contenedor-historial');
    if (!contenedor) return;

    const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
    if (!uid) {
        contenedor.innerHTML = "<p style='text-align:center; padding:20px; color:#666;'>Sin sesión activa</p>";
        return;
    }

    try {
        const query = new URLSearchParams({ tabla: 'menus_semanales', usuario_id: uid, t: String(Date.now()) });
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?" + query.toString());
        const payload = await respuesta.json();
        const datos = extraerFilasRespuestaGoogle(payload);
        const mensajeBackend = extraerMensajeErrorGoogle(payload);

        if (datos.length === 0) {
            contenedor.innerHTML = mensajeBackend
                ? `<p style='text-align:center; padding:20px; color:red;'>Error de Google Sheets: ${mensajeBackend}</p>`
                : "<p style='text-align:center; padding:20px; color:#666;'>No hay semanas guardadas</p>";
            return;
        }

        // Filtrar filas con fecha válida (elimina fila de cabeceras si existe)
        const datosFiltrados = datos.filter(fila => {
            const val = obtenerValorMenuSemanal(fila, 'semana_inicio');
            return Boolean(normalizarFechaYMD(val));
        });

        // Evita inflar histórico por registros duplicados en Google Sheets.
        const datosSinDuplicados = [];
        const clavesVistas = new Set();
        datosFiltrados.forEach(fila => {
            const semana = normalizarFechaYMD(obtenerValorMenuSemanal(fila, 'semana_inicio'));
            const fecha = normalizarFechaYMD(obtenerValorMenuSemanal(fila, 'fecha')) || '';
            const dia = String(obtenerValorMenuSemanal(fila, 'dia') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
            const momento = normalizarNombreMomento(obtenerValorMenuSemanal(fila, 'momento') || '');
            const ingrediente = String(obtenerValorMenuSemanal(fila, 'ingrediente') || '').trim().toLowerCase();
            const puntos = String(obtenerValorMenuSemanal(fila, 'puntos') || '').trim();
            const clave = [semana, fecha, dia, momento, ingrediente, puntos].join('|');

            if (!clavesVistas.has(clave)) {
                clavesVistas.add(clave);
                datosSinDuplicados.push(fila);
            }
        });

        if (datosSinDuplicados.length === 0) {
            contenedor.innerHTML = "<p style='text-align:center; padding:20px; color:#666;'>No hay semanas guardadas</p>";
            return;
        }

        // Agrupar por semana (fecha de inicio)
        const semanasAgrupadas = {};
        datosSinDuplicados.forEach(fila => {
            const semanaInicioRaw = obtenerValorMenuSemanal(fila, 'semana_inicio');
            const semanaInicio = normalizarFechaYMD(semanaInicioRaw);
            if (semanaInicio) {
                if (!semanasAgrupadas[semanaInicio]) {
                    semanasAgrupadas[semanaInicio] = [];
                }
                semanasAgrupadas[semanaInicio].push(fila);
            }
        });

        // Ordenar semanas por fecha descendente
        const semanasOrdenadas = Object.keys(semanasAgrupadas).sort((a, b) => {
            const fechaA = parseFechaYMD(a);
            const fechaB = parseFechaYMD(b);
            return fechaB - fechaA;
        });

        let html = "";
        semanasOrdenadas.forEach(semanaFecha => {
            const filasSemana = semanasAgrupadas[semanaFecha];
            let totalPuntos = 0;
            let presupuestoSemana = null;

            filasSemana.forEach(fila => {
                const puntos = obtenerValorMenuSemanal(fila, 'puntos') || 0;
                totalPuntos += parseFloat(puntos || 0);

                if (presupuestoSemana === null) {
                    presupuestoSemana = obtenerPresupuestoDesdeFila(fila);
                }
            });

            const valorHistorial = presupuestoSemana !== null ? presupuestoSemana : Math.round(totalPuntos);

            html += `
                <div class="item-historial" onclick="cargarSemanaDesdeHistorial('${semanaFecha}')">
                    <div class="fecha-historial">${formatearFechaES(semanaFecha)}</div>
                    <div class="presupuesto-historial">${valorHistorial} pts</div>
                </div>
            `;
        });

        contenedor.innerHTML = html;
    } catch (error) {
        console.error("Error cargando historial de semanas:", error);
        contenedor.innerHTML = "<p style='text-align:center; padding:20px; color:red;'>Error al cargar el historial</p>";
    }
}

async function cargarSemanaDesdeHistorial(fechaSemana) {
    try {
        const uid = usuarioActivo || localStorage.getItem('nutrafit_usuario_id');
        if (!uid) {
            alert('Sin sesión activa. Vuelve a identificarte.');
            return;
        }

        const query = new URLSearchParams({ tabla: 'menus_semanales', usuario_id: uid, t: String(Date.now()) });
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?" + query.toString());
        const payload = await respuesta.json();
        const datos = extraerFilasRespuestaGoogle(payload);
        const mensajeBackend = extraerMensajeErrorGoogle(payload);

        if (datos.length === 0) {
            if (mensajeBackend) {
                alert("No se pudo cargar la semana: " + mensajeBackend);
            } else {
                alert("No se encontraron datos para esta semana");
            }
            return;
        }

        // Filtrar datos de la semana específica (excluye cabeceras)
        const datosSemanaFiltrados = datos.filter(fila => {
            const semanaInicioRaw = obtenerValorMenuSemanal(fila, 'semana_inicio');
            const semanaInicio = normalizarFechaYMD(semanaInicioRaw);
            return semanaInicio === fechaSemana;
        });

        // Deduplicar filas de la semana para no repetir ingredientes/momentos al cargar.
        const datosSemana = [];
        const clavesSemana = new Set();
        datosSemanaFiltrados.forEach(fila => {
            const fecha = normalizarFechaYMD(obtenerValorMenuSemanal(fila, 'fecha')) || '';
            const dia = String(obtenerValorMenuSemanal(fila, 'dia') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
            const momento = normalizarNombreMomento(obtenerValorMenuSemanal(fila, 'momento') || '');
            const ingrediente = String(obtenerValorMenuSemanal(fila, 'ingrediente') || '').trim().toLowerCase();
            const puntos = String(obtenerValorMenuSemanal(fila, 'puntos') || '').trim();
            const clave = [fechaSemana, fecha, dia, momento, ingrediente, puntos].join('|');

            if (!clavesSemana.has(clave)) {
                clavesSemana.add(clave);
                datosSemana.push(fila);
            }
        });

        if (datosSemana.length === 0) {
            alert("No se encontraron datos para esta semana");
            return;
        }

        // Limpiar formulario actual
        reiniciarFormulario();

        // Establecer fecha de inicio
        const fechaInput = document.getElementById('fecha-inicio');
        if (fechaInput) {
            fechaInput.value = fechaSemana;
        }

        const presupuestoSemana = datosSemana.reduce((acc, fila) => {
            if (acc !== null) return acc;
            return obtenerPresupuestoDesdeFila(fila);
        }, null);

        if (presupuestoSemana !== null) {
            const presupuestoInput = document.getElementById('total-' + diaActual) || document.querySelector('[id^="total-"]');
            if (presupuestoInput) {
                presupuestoInput.value = presupuestoSemana;
            }
            ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach(dia => {
                localStorage.setItem(clavePresupuestoDia(dia), String(presupuestoSemana));
            });
        }

        // Organizar datos por día y momento
        const datosPorDia = {};
        datosSemana.forEach(fila => {
            const dia = obtenerValorMenuSemanal(fila, 'dia');
            const momento = obtenerValorMenuSemanal(fila, 'momento');
            const ingrediente = obtenerValorMenuSemanal(fila, 'ingrediente');
            const puntos = obtenerValorMenuSemanal(fila, 'puntos') || 0;

            if (!dia || !momento) return;

            const diaNorm = normalizarDiaMenuAId(dia);
            const momentoNorm = normalizarNombreMomento(momento);
            if (!diaNorm || !momentoNorm) return;

            if (!datosPorDia[diaNorm]) {
                datosPorDia[diaNorm] = {};
            }
            if (!datosPorDia[diaNorm][momentoNorm]) {
                datosPorDia[diaNorm][momentoNorm] = [];
            }
            datosPorDia[diaNorm][momentoNorm].push({ ingrediente, puntos });
        });

        // Mapear nombres de días a IDs
        // Llenar formulario
        Object.keys(datosPorDia).forEach(diaId => {
            const contenedorDia = document.getElementById(diaId);
            if (!contenedorDia) return;

            const cards = contenedorDia.querySelectorAll('.card-momento');

            Object.keys(datosPorDia[diaId]).forEach(momento => {
                // Encontrar la card correspondiente al momento
                const card = Array.from(cards).find(c => 
                    normalizarNombreMomento((c.querySelector('.momento-titulo')?.innerText || '').trim())
                    === normalizarNombreMomento(momento)
                );

                if (card) {
                    const contenedorIngredientes = card.querySelector('.contenedor-ingredientes');
                    if (contenedorIngredientes) {
                        contenedorIngredientes.innerHTML = '';

                        datosPorDia[diaId][momento].forEach(item => {
                            const fila = document.createElement('div');
                            fila.className = 'fila-ingrediente';

                            const inputTxt = document.createElement('input');
                            inputTxt.type = 'text';
                            inputTxt.className = 'input-txt';
                            inputTxt.placeholder = 'Ingrediente...';
                            inputTxt.value = item.ingrediente || '';
                            if (typeof prepararInputIngredienteDiario === 'function') {
                                prepararInputIngredienteDiario(inputTxt);
                            }
                            inputTxt.addEventListener('input', function() {
                                gestionarNuevaFila(this);
                                guardarEstadoSemanaLocal();
                            });

                            const inputPts = document.createElement('input');
                            inputPts.type = 'number';
                            inputPts.className = 'input-pts';
                            inputPts.value = item.puntos || '0';
                            inputPts.addEventListener('input', function() {
                                actualizarPuntos();
                                guardarEstadoSemanaLocal();
                            });

                            fila.appendChild(inputTxt);
                            fila.appendChild(inputPts);
                            contenedorIngredientes.appendChild(fila);
                        });

                        if (typeof asegurarPapeleraEnFilasDiario === 'function') {
                            asegurarPapeleraEnFilasDiario();
                        }
                    }
                }
            });
        });

        // Cambiar al día activo (lunes por defecto)
        const btnLunes = getTabButton('lunes');
        if (btnLunes) {
            cambiarDia('lunes', btnLunes);
        }

        // Guardar estado
        guardarEstadoSemanaLocal();
        recalcularDisponiblesSemana();
        actualizarPuntos();

        alert("Semana cargada correctamente desde el historial");

    } catch (error) {
        console.error("Error cargando semana desde historial:", error);
        alert("Error al cargar la semana desde el historial");
    }
}