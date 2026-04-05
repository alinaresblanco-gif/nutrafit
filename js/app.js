 /* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbwt5g-RQAwl3nwOf7Hv6gGCleE4WmmTjepY0-eyCmJLRNGE78c_Acji58dOiQk2iNYa/exec";

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

/** * NAVEGACIÓN Y UTILIDADES */
function volverInicio() {
    if (window.location.pathname.includes('/vistas/')) {
        window.location.href = '../index.html';
    } else {
        window.location.href = 'index.html';
    }
}

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
    const inputBusqueda = document.getElementById('busqueda-recetas');
    if(inputBusqueda) {
        inputBusqueda.addEventListener('input', filtrarRecetas);
    }
});
// ==========================================
//   LÓGICA SENIOR: MENÚS + DESPENSA CLOUD (V2)
// ==========================================

// VARIABLES GLOBALES
let seccionDestino = null; // Referencia al momento (comida, cena, etc.) que pidió el ingrediente

/**
 * 1. NAVEGACIÓN BLINDADA
 */
function volverInicio() {
    if (window.location.pathname.includes('/vistas/')) {
        window.location.href = '../index.html';
    } else {
        window.location.href = 'index.html';
    }
}

/**
 * 2. CONTROL DE MODALES
 */
function abrirNuevoMenu() {
    const modal = document.getElementById('modal-nuevo');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; 
    }
}

function cerrarNuevoMenu() {
    const modal = document.getElementById('modal-nuevo');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; 
    }
}

// Lógica de cierre para el modal de la despensa (iframe)
function cerrarDespensa() {
    const modal = document.getElementById('modal-despensa');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    seccionDestino = null; 
}

/**
 * 3. LÓGICA DEL ACORDEÓN SEMANAL
 */
function toggleDia(idFicha) {
    const fichaSeleccionada = document.getElementById(idFicha);
    if (!fichaSeleccionada) return;
    if (fichaSeleccionada.classList.contains('activo')) return; 

    const fichaAbiertaAnterior = document.querySelector('.dia-ficha.activo');
    if (fichaAbiertaAnterior) {
        fichaAbiertaAnterior.classList.remove('activo');
    }

    fichaSeleccionada.classList.add('activo');

    setTimeout(() => {
        fichaSeleccionada.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }, 100);
}

/**
 * 4. GESTIÓN DE FILAS DINÁMICAS (INGREDIENTES)
 */
function verificarFilaNueva(input) {
    const filaActual = input.parentElement;
    const contenedor = filaActual.parentElement;
    const todasLasFilas = contenedor.querySelectorAll('.fila-ingrediente');
    
    if (filaActual === todasLasFilas[todasLasFilas.length - 1] && input.value.trim() !== "") {
        crearNuevaFila(contenedor);
    }
}

function crearNuevaFila(contenedor) {
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'fila-ingrediente';
    nuevaFila.innerHTML = `
        <input type="text" class="input-ingrediente" placeholder="Añadir ingrediente..." oninput="verificarFilaNueva(this)">
        <input type="number" class="input-puntos-ing" value="0" oninput="actualizarPuntosDia(this)">
    `;
    contenedor.appendChild(nuevaFila);
}

/**
 * 5. CONEXIÓN CON IFRAME (NUEVA LÓGICA DE MENSAJERÍA)
 */
function abrirDespensa(boton) {
    // Identificamos la lista exacta de ingredientes donde se pulsó el botón (+)
    seccionDestino = boton.closest('.momento-seccion').querySelector('.lista-ingredientes');
    
    const modal = document.getElementById('modal-despensa');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// EL RECEPTOR: Escucha el mensaje que envía "nuestra_despensa.html"
window.addEventListener("message", function(event) {
    const comida = event.data;

    // Verificamos que el mensaje traiga el formato correcto
    if (comida && comida.tipo === "ALIMENTO_SELECCIONADO") {
        
        if (!seccionDestino) return;

        const filas = seccionDestino.querySelectorAll('.fila-ingrediente');
        
        // Buscamos si hay una fila vacía para rellenar
        let filaParaRellenar = Array.from(filas).find(f => 
            f.querySelector('.input-ingrediente').value.trim() === ""
        );

        // Si no hay filas vacías, usamos la última
        if (!filaParaRellenar) {
            filaParaRellenar = filas[filas.length - 1];
        }

        if (filaParaRellenar) {
            const inputNombre = filaParaRellenar.querySelector('.input-ingrediente');
            const inputPuntos = filaParaRellenar.querySelector('.input-puntos-ing');

            // Insertamos los valores recibidos del iframe
            inputNombre.value = comida.Nombre;
            inputPuntos.value = comida.Netos;

            // Disparamos las funciones de cálculo y expansión
            verificarFilaNueva(inputNombre);
            actualizarPuntosDia(inputPuntos);
        }

        // Cerramos el modal automáticamente tras seleccionar
        cerrarDespensa();
    }
});

/**
 * 6. CÁLCULOS DE PUNTOS
 */
function actualizarPuntosDia(el) {
    const ficha = el.closest('.dia-ficha');
    if (!ficha) return;
    
    const inputPresupuestoTotal = ficha.querySelector('.input-puntos-dia');
    const displayRestante = ficha.querySelector('.input-restantes-dia');
    const todosLosIngredientes = ficha.querySelectorAll('.input-puntos-ing');
    
    let sumaConsumida = 0;
    todosLosIngredientes.forEach(ing => {
        sumaConsumida += parseFloat(ing.value) || 0;
    });

    const presupuestoManual = parseFloat(inputPresupuestoTotal.value) || 0;
    const resultadoResta = presupuestoManual - sumaConsumida;
    
    if (displayRestante) {
        displayRestante.value = resultadoResta;

        if (resultadoResta < 0) {
            displayRestante.style.color = "white";
            displayRestante.style.backgroundColor = "#e74c3c";
            displayRestante.style.fontWeight = "bold";
        } else {
            displayRestante.style.color = "#d35400";
            displayRestante.style.backgroundColor = "white";
            displayRestante.style.fontWeight = "normal";
        }
    }
}
function cerrarDespensa() {
    document.getElementById('modal-despensa').style.display = 'none';
    document.body.style.overflow = 'auto'; // Devuelve el scroll a la página
    seccionDestino = null; 
}

function guardarNuevoMenu() {
    const fecha = document.getElementById('input-fecha-nueva').value;
    if (!fecha) {
        alert("⚠️ Por favor, selecciona una fecha de inicio.");
        return;
    }
    alert("Planificación guardada correctamente.");
    cerrarNuevoMenu();
}

/**
 * 7. CARGA INICIAL
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("Sistema de Menús NutraFit: Receptor de Iframe Activo.");
    
    document.querySelectorAll('.input-puntos-dia').forEach(inputTotal => {
        actualizarPuntosDia(inputTotal);
    });
});