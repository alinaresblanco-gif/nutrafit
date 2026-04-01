/* ============================================================
    CONTROL TOTAL NUTRAFIT - MI LIBRO DE RECETAS
   ============================================================ */

let todasLasRecetas = []; // Para guardar los datos del Excel y filtrar rápido
let imagenRecetaBase64 = null;

// --- 1. AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    cargarRecetasDesdeSheets();
});

// --- 2. NAVEGACIÓN ---
function mostrarFormulario() {
    document.getElementById('seccion-explorar').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';
    window.scrollTo(0,0);
}

function volverExplorador() {
    document.getElementById('seccion-formulario').style.display = 'none';
    document.getElementById('modal-detalle-receta').style.display = 'none';
    document.getElementById('seccion-explorar').style.display = 'block';
    // Si queremos volver al menú principal de la App:
    // window.location.href = "../index.html"; 
}

function irAlMenuPrincipal() {
    window.location.href = "../index.html";
}

// --- 3. GESTIÓN DE IMAGEN ---
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

// --- 4. GUARDAR EN GOOGLE SHEETS ---
async function guardarNuevaReceta() {
    const nombre = document.getElementById('form-nombre').value;
    const categoria = document.getElementById('form-categoria').value;
    const ingredientes = document.getElementById('form-ingredientes').value;
    const elaboracion = document.getElementById('form-elaboracion').value;

    if (!nombre || !ingredientes) {
        return alert("Por favor, pon al menos el nombre y los ingredientes.");
    }

    const btn = document.querySelector('.btn-accion-form');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';

    const datos = {
        tipo: "guardar_receta",
        nombre: nombre,
        categoria: categoria,
        ingredientes: ingredientes,
        elaboracion: elaboracion,
        imagen: imagenRecetaBase64
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });

        alert("¡Receta guardada con éxito en tu libro!");
        limpiarFormularioReceta();
        volverExplorador();
        setTimeout(cargarRecetasDesdeSheets, 1500); // Recargar lista
    } catch (error) {
        alert("Error al guardar. Revisa la conexión.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

function limpiarFormularioReceta() {
    document.getElementById('form-nombre').value = "";
    document.getElementById('form-ingredientes').value = "";
    document.getElementById('form-elaboracion').value = "";
    document.getElementById('img-previa-receta').style.display = 'none';
    document.getElementById('icono-camara').style.display = 'block';
    imagenRecetaBase64 = null;
}

// --- 5. CARGAR Y MOSTRAR RECETAS ---
async function cargarRecetasDesdeSheets() {
    const contenedor = document.getElementById('contenedor-cards');
    contenedor.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Cargando tus recetas...</p>';

    try {
        const resp = await fetch(`${URL_GOOGLE_SCRIPT}?tabla=recetas&t=${Date.now()}`);
        todasLasRecetas = await resp.json();
        renderizarRecetas(todasLasRecetas);
    } catch (error) {
        contenedor.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Error al cargar recetas.</p>';
    }
}

function renderizarRecetas(lista) {
    const contenedor = document.getElementById('contenedor-cards');
    contenedor.innerHTML = "";

    lista.reverse().forEach((receta, index) => {
        const imgUrl = receta[1] || 'https://via.placeholder.com/150?text=Sin+Foto';
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

// --- 6. BUSCADOR ---
function filtrarRecetas() {
    const busqueda = document.getElementById('buscador-recetas').value.toLowerCase();
    const filtradas = todasLasRecetas.filter(r => 
        r[2].toLowerCase().includes(busqueda) || 
        r[3].toLowerCase().includes(busqueda)
    );
    renderizarRecetas(filtradas);
}

// --- 7. DETALLE DE RECETA (MODAL) ---
let recetaActiva = null;

function abrirDetalleReceta(index) {
    // Como la lista está invertida en el render, buscamos la receta correcta
    const listaInvertida = [...todasLasRecetas].reverse();
    const r = listaInvertida[index];
    recetaActiva = r;

    document.getElementById('det-img').src = r[1] || 'https://via.placeholder.com/400?text=NutraFit';
    document.getElementById('det-nombre').innerText = r[2];
    document.getElementById('det-cat').innerText = r[3];
    
    // Procesar ingredientes (uno por línea)
    const listaIng = document.getElementById('det-ingredientes');
    listaIng.innerHTML = "";
    const ingredientesArr = r[4].split('\n');
    
    ingredientesArr.forEach(ing => {
        if(ing.trim() !== "") {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>• ${ing}</span>
                <i class="fas fa-cart-plus btn-carrito" onclick="añadirAListaCompra('${ing.replace(/'/g, "\\'")}')"></i>
            `;
            listaIng.appendChild(li);
        }
    });

    document.getElementById('det-elaboracion').innerText = r[5];
    document.getElementById('modal-detalle-receta').style.display = 'block';
}

// --- 8. COMPARTIR ---
function compartirReceta() {
    if (!recetaActiva) return;
    const texto = `📖 *${recetaActiva[2]}* (${recetaActiva[3]})\n\n🛒 *Ingredientes:*\n${recetaActiva[4]}\n\n👨‍🍳 *Elaboración:*\n${recetaActiva[5]}\n\nCompartido desde NutraFit 💪`;
    
    if (navigator.share) {
        navigator.share({ title: recetaActiva[2], text: texto }).catch(console.error);
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
}

// --- 9. LANZAR AL CARRITO DE LA COMPRA ---
async function añadirAListaCompra(producto) {
    // Usamos el sistema de guardado de la lista de compra que ya tienes
    const datos = {
        tipo: "guardar_compra", // Asegúrate de que este es el nombre en tu Google Script
        articulo: producto,
        cantidad: "1"
    };

    try {
        // Mostramos un aviso visual en el icono
        event.target.classList.remove('fa-cart-plus');
        event.target.classList.add('fa-check-circle');
        event.target.style.color = '#4CAF50';

        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });

        console.log("Añadido: " + producto);
    } catch (e) {
        alert("No se pudo añadir a la lista.");
    }
}