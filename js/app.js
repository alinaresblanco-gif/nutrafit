/* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbxz_-BECkFwPxTkVRie8ICyJ5obZAHfYzllC0ACIKarucxNSZRCthPI8IfQhpSJ3lx7/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;

/* --- 1. NAVEGACIÓN TIPO APP (SIN RECARGAR PÁGINA) --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        const textoHtml = await respuesta.text();
        
        contenedorVistas.innerHTML = textoHtml;
        
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';

        // Lógica específica según la vista
        if (nombreVista === 'agua') {
            inicializarAgua();
            cargarHistorico();
        }

        if (nombreVista === 'creditos-diarios') {
            setTimeout(() => {
                inicializarFecha(); // Pone fecha de hoy
                calcularCreditos(); // Cálculo inicial
                cargarHistorialCreditos(); // Carga tabla de Excel
            }, 100);
        }

    } catch (error) {
        console.error("Error al abrir la vista:", error);
        alert("No se pudo cargar la sección.");
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
        if (vasosActuales < objetivoDiario) {
            vasosActuales++;
        }
    }
    localStorage.setItem('agua_nutrafit', vasosActuales);
    actualizarInterfazAgua();
}

function actualizarInterfazAgua() {
    const texto = document.getElementById('contador-texto');
    const barra = document.getElementById('barra-llenado');
    const botones = document.querySelectorAll('.boton-vaso');

    if (texto) texto.innerText = `${vasosActuales} / ${objetivoDiario} Vasos`;
    
    if (barra) {
        const porcentaje = (vasosActuales / objetivoDiario) * 100;
        barra.style.width = `${porcentaje}%`;
    }

    botones.forEach((btn, index) => {
        if (index < vasosActuales) {
            btn.classList.add('activo');
        } else {
            btn.classList.remove('activo');
        }
    });
}

/* --- 3. CONEXIÓN CON GOOGLE SHEETS (AGUA) --- */
async function reiniciarAgua() {
    if (vasosActuales === 0) {
        alert("¡Marca al menos un vaso!");
        return;
    }

    if (confirm("¿Guardar y reiniciar?")) {
        try {
            await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                mode: "no-cors", 
                body: JSON.stringify({ tipo: "agua", vasos: vasosActuales })
            });

            alert("¡Datos enviados con éxito!");
            
            vasosActuales = 0;
            localStorage.setItem('agua_nutrafit', 0);
            actualizarInterfazAgua();
            
            setTimeout(cargarHistorico, 2000); 

        } catch (error) {
            alert("Error al conectar.");
        }
    }
}

async function cargarHistorico() {
    const contenedor = document.getElementById('datos-tabla');
    if (!contenedor) return;

    try {
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?t=" + new Date().getTime());
        const filas = await respuesta.json();

        contenedor.innerHTML = ""; 

        if (!filas || filas.length === 0) {
            contenedor.innerHTML = "<tr><td colspan='3' style='padding:20px;'>Aún no hay registros en el historial</td></tr>";
            return;
        }

        filas.forEach(fila => {
            let tr = document.createElement('tr');
            let fechaFormateada = fila[0];
            const colorEstado = fila[2] === "COMPLETADO" ? "#2ecc71" : "#e67e22";
            
            tr.innerHTML = `
                <td>${fechaFormateada}</td>
                <td>${fila[1]}</td>
                <td style="color:${colorEstado}; font-weight:bold;">${fila[2]}</td>
            `;
            contenedor.appendChild(tr);
        });

    } catch (error) {
        console.error("Fallo al cargar historial:", error);
    }
}

/* --- 4. LÓGICA DE CALCULADORA DE CRÉDITOS --- */

function ajustarValor(id, incremento) {
    const input = document.getElementById(id);
    if (!input) return;
    let valorActual = parseFloat(input.value) || 0;
    input.value = (valorActual + incremento).toFixed(id === 'peso-credito' ? 2 : 0);
    calcularCreditos();
}

function calcularCreditos() {
    const genElem = document.getElementById('genero-credito');
    const pesoElem = document.getElementById('peso-credito');
    const altElem = document.getElementById('altura-credito');
    const edadElem = document.getElementById('edad-credito');

    if (!genElem || !pesoElem || !altElem || !edadElem) return;

    const genero = genElem.value;
    const peso = parseFloat(pesoElem.value) || 0;
    const altura = parseFloat(altElem.value) || 0;
    const edad = parseInt(edadElem.value) || 0;

    if (peso > 0 && altura > 0 && edad > 0) {
        let tmb = (genero === "Hombre") 
            ? (10 * peso) + (6.25 * altura) - (5 * edad) + 5
            : (10 * peso) + (6.25 * altura) - (5 * edad) - 161;

        let resultado = Math.ceil((tmb * 0.9) / 35);
        document.getElementById('resultado-creditos').value = resultado;
    } else {
        document.getElementById('resultado-creditos').value = 0;
    }
}

function inicializarFecha() {
    const inputFecha = document.getElementById('fecha-credito');
    if(inputFecha) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }
}

async function guardarCreditos() {
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const datos = {
        tipo: "creditos",
        fecha: document.getElementById('fecha-credito').value,
        genero: document.getElementById('genero-credito').value,
        edad: document.getElementById('edad-credito').value,
        peso: document.getElementById('peso-credito').value,
        altura: document.getElementById('altura-credito').value,
        resultado: document.getElementById('resultado-creditos').value
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });
        
        alert("¡Petición enviada! Los créditos aparecerán en el historial en unos segundos.");
        setTimeout(cargarHistorialCreditos, 2000);
        
    } catch (error) {
        console.error("Error:", error);
        alert("Error al conectar con la base de datos");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> GUARDAR EN HISTORIAL';
    }
}

async function cargarHistorialCreditos() {
    const cuerpoTabla = document.getElementById('tabla-creditos-body');
    if (!cuerpoTabla) return;

    try {
        const response = await fetch(URL_GOOGLE_SCRIPT + "?tabla=creditos&t=" + new Date().getTime());
        const datos = await response.json();
        
        if (datos && datos.length > 0) {
            cuerpoTabla.innerHTML = datos.map(fila => `
                <tr>
                    <td style="padding:10px; border:1px solid #eee;">${fila[0]}</td>
                    <td style="padding:10px; border:1px solid #eee;">${fila[5]}</td>
                    <td style="padding:10px; border:1px solid #eee;">${fila[1]}</td>
                </tr>
            `).join('');
        } else {
            cuerpoTabla.innerHTML = "<tr><td colspan='3' style='padding:15px;'>Sin registros</td></tr>";
        }
    } catch (e) {
        console.log("Error cargando historial de créditos", e);
    }
}