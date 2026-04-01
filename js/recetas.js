/* ============================================================
    LOGICA RECETAS - NUTRAFIT
   ============================================================ */

let todasLasRecetas = [];
let imagenRecetaBase64 = null;

// 1. NAVEGACIÓN (Definidas globalmente para que funcionen siempre)
function mostrarFormulario() {
    document.getElementById('seccion-explorar').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';
    window.scrollTo(0,0);
}

function volverExplorador() {
    document.getElementById('seccion-formulario').style.display = 'none';
    document.getElementById('modal-detalle-receta').style.display = 'none';
    document.getElementById('seccion-explorar').style.display = 'block';
}

function cerrarDetalle() {
    document.getElementById('modal-detalle-receta').style.display = 'none';
}

// 2. INICIO
document.addEventListener('DOMContentLoaded', () => {
    // Intentamos cargar, pero si falla, no rompemos la app
    if(typeof URL_GOOGLE_SCRIPT !== 'undefined') {
        cargarRecetasDesdeSheets();
    }
});

// 3. IMAGENES
function previsualizarFotoReceta(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagenRecetaBase64 = e.target.result.split(',')[1];
            document.getElementById('img-previa-receta').src = e.target.result;
            document.getElementById('img-previa-receta').style.display = 'block';
            document.getElementById('icono-camara').style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// 4. CONEXIÓN SHEETS
async function cargarRecetasDesdeSheets() {
    try {
        const resp = await fetch(`${URL_GOOGLE_SCRIPT}?tabla=recetas&t=${Date.now()}`);
        const datos = await resp.json();
        if(datos && datos.length > 0) {
            todasLasRecetas = datos;
            renderizarRecetas(todasLasRecetas);
        }
    } catch (error) {
        console.log("Esperando primera receta...");
    }
}

function renderizarRecetas(lista) {
    const contenedor = document.getElementById('contenedor-cards');
    contenedor.innerHTML = ""; // Limpiamos el "Cargando" o la tarjeta de ejemplo

    lista.reverse().forEach((receta, index) => {
        const imgUrl = receta[1] || 'https://via.placeholder.com/150?text=NutraFit';
        const card = document.createElement('div');
        card.className = "tarjeta-receta";
        card.innerHTML = `
            <img src="${imgUrl}" alt="${receta[2]}">
            <div class="info-tarjeta">
                <h3>${receta[2]}</h3>
                <button class="btn-ver-receta" onclick="abrirDetalleReceta(${index})">VER RECETA</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

async function guardarNuevaReceta() {
    const nombre = document.getElementById('form-nombre').value;
    const ingredientes = document.getElementById('form-ingredientes').value;
    
    if (!nombre || !ingredientes) return alert("Escribe al menos el nombre y los ingredientes");

    const btn = document.querySelector('.btn-accion-form');
    btn.disabled = true;
    btn.innerHTML = "GUARDANDO...";

    const datos = {
        tipo: "guardar_receta",
        nombre: nombre,
        categoria: document.getElementById('form-categoria').value,
        ingredientes: ingredientes,
        elaboracion: document.getElementById('form-elaboracion').value,
        imagen: imagenRecetaBase64
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });
        alert("¡Receta guardada!");
        location.reload(); // Recargamos para ver la nueva tarjeta
    } catch (e) {
        alert("Error al conectar con Excel");
        btn.disabled = false;
    }
}

function abrirDetalleReceta(index) {
    const r = [...todasLasRecetas].reverse()[index];
    document.getElementById('det-img').src = r[1] || 'https://via.placeholder.com/400';
    document.getElementById('det-nombre').innerText = r[2];
    document.getElementById('det-cat').innerText = r[3];
    
    const listaIng = document.getElementById('det-ingredientes');
    listaIng.innerHTML = "";
    r[4].split('\n').forEach(ing => {
        if(ing.trim()){
            const li = document.createElement('li');
            li.innerHTML = `<span>${ing}</span> <i class="fas fa-cart-plus btn-carrito" onclick="añadirAlCarrito('${ing}')"></i>`;
            listaIng.appendChild(li);
        }
    });
    
    document.getElementById('det-elaboracion').innerText = r[5];
    document.getElementById('modal-detalle-receta').style.display = 'block';
}

function añadirAlCarrito(item) {
    // Aquí podrías llamar a la función que ya tienes en app.js para la cesta
    alert("Añadido a la lista: " + item);
}