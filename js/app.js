/* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbzFF2CRYNxpXB7dItBz8423VCDnzNf09OvRN4JcgCNK0iwbTl3RFAqRtYmvyHipccBy/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;

/* --- 1. NAVEGACIÓN TIPO APP --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        const textoHtml = await respuesta.text();
        
        contenedorVistas.innerHTML = textoHtml;
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';

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

/* --- 3. LÓGICA DE CRÉDITOS (CORREGIDA) --- */
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
    const fecha = document.getElementById('fecha-credito').value;
    const genero = document.getElementById('genero-credito').value;
    const peso = document.getElementById('peso-credito').value;
    const altura = document.getElementById('altura-credito').value;
    const edad = document.getElementById('edad-credito').value;
    const total = document.getElementById('resultado-creditos').value;

    if (!total || total == 0) return alert("Primero calcula tus créditos");

    const datos = {
        tipo: "creditos",
        fecha: fecha,
        genero: genero,
        edad: edad,
        peso: peso,
        altura: altura,
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
    let altura = inputAltura ? parseFloat(inputAltura.value) / 100 : 1.70; 
    if (altura > 0) {
        const imc = (peso / (altura * altura)).toFixed(1);
        actualizarInterfazIMC(imc);
    }
}

function actualizarInterfazIMC(imc) {
    const valorElem = document.getElementById('valor-imc');
    const estadoElem = document.getElementById('estado-imc');
    if (!valorElem || !estadoElem) return;

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
    const peso = document.getElementById('input-peso').value;
    const fecha = document.getElementById('fecha-peso').value;
    if(!peso) return alert("Introduce el peso");

    const tabla = document.getElementById('tabla-peso-body');
    let ultimoPeso = (tabla && tabla.rows.length > 0) ? parseFloat(tabla.rows[0].cells[1].innerText) : peso;

    const datos = { tipo: "peso", fecha: fecha, peso: peso, diferencia: (peso - ultimoPeso).toFixed(1) };
    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("Peso guardado");
        setTimeout(cargarHistorialPeso, 2000);
    } catch (e) { alert("Error al guardar"); }
}

async function cargarHistorialPeso() {
    const cuerpo = document.getElementById('tabla-peso-body');
    if(!cuerpo) return;
    try {
        const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=peso&t=" + new Date().getTime());
        const datos = await res.json();
        cuerpo.innerHTML = datos.map(fila => {
            const dif = parseFloat(fila[2]) || 0;
            const icono = dif < 0 ? "↓" : (dif > 0 ? "↑" : "");
            return `<tr><td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td><td>${fila[1]} kg</td><td style="font-weight:bold; color:${dif < 0 ? '#2ecc71' : '#e74c3c'}">${icono} ${Math.abs(dif).toFixed(1)}</td></tr>`;
        }).join('');
        if(datos.length > 0) {
            calcularIMC(datos[0][1]);
            renderizarGrafico([...datos].reverse());
        }
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

async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("INFORME NUTRAFIT", 20, 20);
    doc.save("Nutrafit_Reporte.pdf");
}