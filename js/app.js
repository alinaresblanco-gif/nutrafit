 /* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbxCDFQulG80hW9XeS0wJv7QFBZtREwb5FGIhBYgRts6DxPT-QMTv6_knUdTvaNbe-na/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;

/* --- 1. NAVEGACIÓN TIPO APP (ACTUALIZADA) --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
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

        // Caso específico para tu nueva vista de Carrito
        if (nombreVista === 'carrito-compra') {
            setTimeout(actualizarInterfazCompra, 100);
        }

    } catch (error) {
        console.error("Error al abrir la vista:", error);
    }
}

function volverInicio() {
    document.getElementById('pantalla-inicio').style.display = 'flex';
    document.getElementById('contenedor-vistas').style.display = 'none';
}

/* --- 2. LÓGICA DE CONTROL DE AGUA --- */
function inicializarAgua() {
    const guardado = localStorage.getItem('agua_nutrafit');
    vasosActuales = guardado ? parseInt(guardado) : 0;
    actualizarInterfazAgua();
}

function gestionarVaso(indiceVaso) {
    if (indiceVaso < vasosActuales) {
        vasosActuales = indiceVaso; 
    } else {
        if (vasosActuales < objetivoDiario) vasosActuales++;
    }
    localStorage.setItem('agua_nutrafit', vasosActuales);
    actualizarInterfazAgua();
}

function actualizarInterfazAgua() {
    const texto = document.getElementById('contador-texto');
    const barra = document.getElementById('barra-llenado');
    const botones = document.querySelectorAll('.boton-vaso');

    if (texto) texto.innerText = `${vasosActuales} / ${objetivoDiario} Vasos`;
    if (barra) barra.style.width = `${(vasosActuales / objetivoDiario) * 100}%`;

    botones.forEach((btn, index) => {
        index < vasosActuales ? btn.classList.add('activo') : btn.classList.remove('activo');
    });
}

async function reiniciarAgua() {
    if (vasosActuales === 0) return alert("¡Marca al menos un vaso!");
    if (confirm("¿Guardar y reiniciar?")) {
        try {
            await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                mode: "no-cors", 
                body: JSON.stringify({ tipo: "agua", vasos: vasosActuales })
            });
            alert("¡Datos enviados!");
            vasosActuales = 0;
            localStorage.setItem('agua_nutrafit', 0);
            actualizarInterfazAgua();
            setTimeout(cargarHistorico, 2000); 
        } catch (error) { alert("Error al conectar."); }
    }
}

async function cargarHistorico() {
    const contenedor = document.getElementById('datos-tabla');
    if (!contenedor) return;
    try {
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?t=" + new Date().getTime());
        const filas = await respuesta.json();
        contenedor.innerHTML = filas.map(fila => {
            const colorEstado = fila[2] === "COMPLETADO" ? "#2ecc71" : "#e67e22";
            return `<tr><td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td><td>${fila[1]}</td><td style="color:${colorEstado}; font-weight:bold;">${fila[2]}</td></tr>`;
        }).join('') || "<tr><td colspan='3'>Sin registros</td></tr>";
    } catch (error) { console.error("Error historial agua", error); }
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

    const datos = {
        tipo: "creditos",
        fecha: document.getElementById('fecha-credito').value,
        genero: document.getElementById('genero-credito').value,
        edad: document.getElementById('edad-credito').value,
        peso: document.getElementById('peso-credito').value,
        altura: document.getElementById('altura-credito').value,
        total: total
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("¡Créditos guardados!");
        setTimeout(cargarHistorialCreditos, 2000);
    } catch (e) { alert("Error al guardar"); }
}

async function cargarHistorialCreditos() {
    const cuerpoTabla = document.getElementById('tabla-creditos-body');
    if (!cuerpoTabla) return;
    try {
        const response = await fetch(URL_GOOGLE_SCRIPT + "?tabla=creditos&t=" + new Date().getTime());
        const datos = await response.json();
        cuerpoTabla.innerHTML = datos.map(fila => `
            <tr>
                <td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:bold; color:#78a978;">${fila[5] || '---'}</td>
                <td>${fila[1] || '---'}</td>
            </tr>
        `).join('');
    } catch (e) { console.log("Error créditos", e); }
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

    const datos = { tipo: "peso", fecha: fecha, peso: pesoActual, diferencia: diferencia };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        setTimeout(cargarHistorialPeso, 2000);
    } catch (e) { alert("Error al guardar"); }
}

async function cargarHistorialPeso() {
    const cuerpo = document.getElementById('tabla-peso-body');
    if(!cuerpo) return;

    try {
        const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=peso&t=" + new Date().getTime());
        const datos = await res.json();

        if (!datos || datos.length === 0) {
            cuerpo.innerHTML = "<tr><td colspan='3'>Aún no hay registros</td></tr>";
            return;
        }

        cuerpo.innerHTML = datos.map(fila => {
            const dif = parseFloat(fila[2]) || 0;
            const icono = dif < 0 ? "↓" : (dif > 0 ? "↑" : "");
            return `<tr>
                <td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:bold;">${fila[1]} kg</td>
                <td style="font-weight:bold; color:${dif < 0 ? '#2ecc71' : '#e74c3c'}">${icono} ${Math.abs(dif).toFixed(1)}</td>
            </tr>`;
        }).join('');

        calcularIMC(parseFloat(datos[0][1]));
        renderizarGrafico([...datos].reverse());

    } catch (e) { console.error("Error peso", e); }
}

function renderizarGrafico(datos) {
    const ctx = document.getElementById('graficoPeso');
    if (!ctx || typeof Chart === 'undefined') return;
    if (graficoPesoInstancia) graficoPesoInstancia.destroy();
    graficoPesoInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.map(f => new Date(f[0]).toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})),
            datasets: [{
                label: 'Peso',
                data: datos.map(f => f[1]),
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
/* --- 8. LÓGICA DE LISTA DE COMPRA (DISEÑO IMAGEN 3) --- */
let listaCompra = JSON.parse(localStorage.getItem('nutrafit_lista_compra')) || [];

function agregarItemCompra() {
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
    const item = listaCompra.find(i => i.id === id);
    if (item) {
        item.comprado = !item.comprado;
        actualizarInterfazCompra();
    }
}

function eliminarItemCompra(id) {
    // No preguntamos para eliminar uno solo para que sea ágil, como en la imagen
    listaCompra = listaCompra.filter(i => i.id !== id);
    actualizarInterfazCompra();
}

function limpiarListaCompra() {
    if (listaCompra.length === 0) return;
    if (confirm("¿Deseas vaciar toda la lista de la compra?")) {
        listaCompra = [];
        actualizarInterfazCompra();
    }
}

function actualizarInterfazCompra() {
    const contenedor = document.getElementById('lista-compra-items');
    const progreso = document.getElementById('progreso-compra');
    
    if (!contenedor) return;

    // Sincronizar con almacenamiento local (Persistencia)
    localStorage.setItem('nutrafit_lista_compra', JSON.stringify(listaCompra));

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
async function cargarHistorialEjercicios() {
    const contenedor = document.getElementById('lista-actividades-historial');
    const resumenMinutos = document.getElementById('minutos-hoy-resumen');
    if (!contenedor) return;

    try {
        const respuesta = await fetch(`${URL_GOOGLE_SCRIPT}?tabla=ejercicio&t=${Date.now()}`);
        const datos = await respuesta.json();
        
        let minutosTotalesHoy = 0;
        const hoyFecha = new Date().toISOString().split('T')[0];
        contenedor.innerHTML = ""; 
        
        datos.reverse().forEach(fila => {
            const fechaFila = fila[0] ? fila[0].split('T')[0] : "";
            if (fechaFila === hoyFecha) {
                minutosTotalesHoy += parseFloat(fila[2] || 0);
            }

            const card = document.createElement('div');
            card.className = "tarjeta-actividad-final";
            
            let dist = fila[4];
            if (dist && dist.toString().includes('2026')) {
                 dist = parseFloat(dist) || dist;
            }

            let htmlImagen = '';
            if (fila[3] && fila[3].toString().startsWith('data:image')) {
                htmlImagen = `
                    <div style="background:#000; width:100%; text-align:center; padding:5px; box-sizing:border-box;">
                        <img src="${fila[3]}" style="width:100%; max-height:300px; object-fit:contain; display:block; border-radius:8px;">
                    </div>`;
            }

            const datosCompartir = {
                act: fila[1],
                dist: dist,
                tiempo: fila[2],
                vel: fila[7]
            };
            const jsonDatos = JSON.stringify(datosCompartir).replace(/"/g, '&quot;');

            card.innerHTML = `
                <div class="cabecera-card" style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <strong>${fila[1].toUpperCase()}</strong>
                        <small>${fechaFila}</small>
                    </div>
                    <button onclick="compartirActividad('${jsonDatos}')" class="btn-compartir-mini">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
                ${htmlImagen}
                <div class="bloque-blanco-datos">
                    <div class="dato-celda"><label>DISTANCIA</label><span>${dist} KM</span></div>
                    <div class="dato-celda"><label>TIEMPO</label><span>${fila[2]} MIN</span></div>
                    <div class="dato-celda"><label>DESNIVEL</label><span>${fila[6] || 0} M</span></div>
                    <div class="dato-celda"><label>PASOS</label><span>${fila[5] || 0}</span></div>
                </div>
                <div class="franja-velocidad">VEL. MEDIA: ${fila[7] || 0} KM/H</div>
            `;
            contenedor.appendChild(card);
        });

        if(resumenMinutos) resumenMinutos.innerText = minutosTotalesHoy + " min";

    } catch (error) {
        console.log("Error cargando historial");
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

    const datos = {
        tipo: "guardar_ejercicio",
        actividad: actividadActual,
        tiempo: tiempo,
        distancia: "'" + distanciaLimpia, 
        pasos: document.getElementById('ej-pasos').value,
        desnivel: document.getElementById('ej-desnivel').value || 0,
        velocidad: "'" + velMedia,
        imagenBase64: imagenParaEnviar
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("¡Guardado!");
        reiniciarFormularioEjercicio();
        setTimeout(cargarHistorialEjercicios, 1500);
    } catch (e) {
        alert("Error de red");
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

// Función volver corregida
function volverInicio() {
    if (window.location.pathname.includes('/vistas/')) {
        window.location.href = '../index.html';
    } else {
        window.location.href = 'index.html';
    }
}

// Funciones para Captura de Imagen
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

function abrirFormulario() {
    document.getElementById('seccion-explorar').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';
}

function cerrarTodo() {
    document.getElementById('seccion-formulario').style.display = 'none';
    document.getElementById('modal-detalle-receta').style.display = 'none';
    document.getElementById('seccion-explorar').style.display = 'block';
    imagenRecetaBase64 = null;
    const vistaPrevia = document.getElementById('previa-receta-cont');
    if (vistaPrevia) vistaPrevia.style.display = 'none';
}

// Guardar Receta con actualización instantánea
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
        
        // Resetear campos
        document.getElementById('form-nombre').value = "";
        document.getElementById('form-ingredientes').value = "";
        document.getElementById('form-elaboracion').value = "";
        
        cerrarTodo();
        
        // Recarga inmediata después de guardar
        cargarRecetasDesdeExcel();
        
    } catch (e) {
        alert("Error al conectar con el servidor");
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

/* ============================================================
    LECTOR DE RECETAS REALES - VERSIÓN DE DIAGNÓSTICO SENIOR
   ============================================================ */

// Carga al abrir la vista
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('contenedor-cards')) {
        cargarRecetasDesdeExcel();
    }
});

// Listener para el menú
document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-menu-recetas') || e.target.closest('.enlace-recetas')) {
        cargarRecetasDesdeExcel();
    }
});

async function cargarRecetasDesdeExcel() {
    const contenedor = document.getElementById('contenedor-cards');
    if (!contenedor) return;

    // MENSAJE DE CARGA SOLICITADO
    contenedor.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 40px;">
            <i class="fas fa-cookie-bite fa-spin" style="color:var(--verde-corp); font-size:2.5rem; margin-bottom:15px;"></i>
            <p style="font-weight:bold; color:#666;">Cargando Recetas...</p>
        </div>`;

    try {
        // Evitar caché con timestamp
        const urlFull = URL_GOOGLE_SCRIPT + "?tabla=recetas&v=" + new Date().getTime();
        
        const respuesta = await fetch(urlFull);
        
        if (!respuesta.ok) throw new Error("No se pudo obtener respuesta del servidor");

        const filas = await respuesta.json();

        contenedor.innerHTML = ""; // Limpiar mensaje de carga

        if (!filas || filas.length === 0) {
            contenedor.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Tu libro está vacío. ¡Añade tu primera receta!</p>";
            return;
        }

        // Dibujar tarjetas (Invertidas: lo nuevo arriba)
        filas.reverse().forEach((receta) => {
            // Ignorar filas sin nombre
            if (!receta[2] || receta[2].trim() === "") return;

            const imagen = (receta[1] && receta[1].length > 100) ? receta[1] : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';
            const nombre = receta[2];
            const categoria = receta[3] || "Varios";
            const ingredientes = receta[4] || "";
            const elaboracion = receta[5] || "";

            const div = document.createElement('div');
            div.className = 'tarjeta-receta';
            div.innerHTML = `
                <img src="${imagen}" alt="${nombre}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c'">
                <div class="info-tarjeta">
                    <span style="font-size:0.7rem; color:var(--verde-corp); font-weight:bold; letter-spacing:1px;">${categoria.toUpperCase()}</span>
                    <h3>${nombre}</h3>
                    <button class="btn-ver-receta">VER RECETA</button>
                </div>
            `;

            div.querySelector('.btn-ver-receta').onclick = () => {
                abrirDetalleReceta(nombre, ingredientes, elaboracion, imagen);
            };

            contenedor.appendChild(div);
        });

    } catch (error) {
        console.error("Error al cargar:", error);
        
        // Mensaje de error con botón de reintento
        contenedor.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 30px; border: 2px dashed #ffcccc; border-radius: 15px;">
                <i class="fas fa-exclamation-circle" style="color: #ff5c5c; font-size: 2rem;"></i>
                <p style="margin: 10px 0; font-weight: bold;">¡Ups! No pudimos cargar las recetas.</p>
                <small style="color: #888; display: block; margin-bottom: 15px;">Error: ${error.message}</small>
                <button onclick="cargarRecetasDesdeExcel()" 
                        style="background: var(--verde-corp); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    REINTENTAR AHORA
                </button>
            </div>`;
    }
}

function abrirDetalleReceta(nombre, ing, elab, img) {
    document.getElementById('det-nombre').innerText = nombre;
    document.getElementById('det-ing').innerHTML = String(ing).replace(/\n/g, '<br>');
    document.getElementById('det-elab').innerHTML = String(elab).replace(/\n/g, '<br>');
    document.getElementById('det-img-full').src = img;
    document.getElementById('modal-detalle-receta').style.display = 'block';
}