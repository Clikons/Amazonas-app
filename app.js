// ===== 1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE =====
const SUPABASE_URL = "https://coyqeidrpnmmwdumshid.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_NOf7_vxVzHzjnpoyp5etQQ_IJig6a7P"; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

let html5QrcodeScanner = null; // Variable global para controlar la cámara

// ===== 2. CONTROL DE FLUJO AL CARGAR LA PÁGINA (window.onload) =====
window.onload = async function () {
  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (session) {
    localStorage.setItem("loggedUser", session.user.email);
    registrarEnListaLocal(session.user.email);

    if (session.user.email === ADMIN_USER) {
      localStorage.setItem("isAdmin", "true");
      showAdminPanel();
    } else {
      localStorage.setItem("isAdmin", "false");
    }
    showApp();
  } else {
    localStorage.removeItem("loggedUser");
    localStorage.removeItem("isAdmin");
    showLogin();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      localStorage.setItem("loggedUser", session.user.email);
      registrarEnListaLocal(session.user.email);
      localStorage.setItem("isAdmin", session.user.email === ADMIN_USER ? "true" : "false");
      showApp();
      if (session.user.email === ADMIN_USER) showAdminPanel();
    }
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("isAdmin");
      location.reload();
    }
  });
};

// ===== 3. FUNCIONES DE AUTENTICACIÓN =====
async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://clikons.github.io/Amazonas-app/' } // URL exacta de redirección
  });
  if (error) alert("Error al conectar con Google: " + error.message);
}

async function register() {
  let email = document.getElementById("regUser").value.trim();
  let pass = document.getElementById("regPass").value.trim();

  if (!email || !pass) return alert("Completa los campos");

  if (!email.includes("@") || !email.includes(".")) {
    return alert("Por favor, introduce un correo electrónico válido.");
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: pass,
  });

  if (error) {
    return alert("Error al crear cuenta: " + error.message);
  }

  registrarEnListaLocal(email);
  alert("¡Código de confirmación enviado! Revisa tu correo electrónico para verificar tu cuenta.");

  document.getElementById("regUser").value = "";
  document.getElementById("regPass").value = "";
  showLogin();
}

async function login() {
  let user = document.getElementById("loginUser").value.trim();
  let pass = document.getElementById("loginPass").value.trim();

  if (!user || !pass) return alert("Por favor ingresa usuario/email y contraseña");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    localStorage.setItem("loggedUser", user);
    localStorage.setItem("isAdmin", "true");
    showApp();
    showAdminPanel();
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: user,
    password: pass,
  });

  if (error) {
    return alert("Error de inicio de sesión: " + error.message);
  }
}

async function logout() {
  if (html5QrcodeScanner) detenerEscaneoCamara();
  await supabaseClient.auth.signOut();
  localStorage.removeItem("loggedUser");
  localStorage.removeItem("isAdmin");
  location.reload();
}

function registrarEnListaLocal(email) {
  let users = getUsers();
  if (!users[email]) {
    users[email] = "Protegida (Supabase Auth)"; 
    saveUsers(users);
  }
}

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || {};
}

function saveUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
}


// ===== 5. VISTAS Y RENDERIZADO DE INTERFAZ (UI) =====

// Variable global para controlar el intervalo del temporizador y que no se duplique
let intervalCupones = null;

async function renderCoupons() {
  let list = document.getElementById("couponList");
  let userEmail = localStorage.getItem("loggedUser");
  if (!list || !userEmail) return;

  // Limpiamos cualquier intervalo previo para evitar que el reloj se vuelva loco
  if (intervalCupones) clearInterval(intervalCupones);

  list.innerHTML = "<p style='opacity:0.7'>Buscando cupones activos... ⏳</p>";

  const { data: cupones, error: errorCupones } = await supabaseClient
    .from('Cupones')
    .select('*');

  const { data: canjeados, error: errorCanjes } = await supabaseClient
    .from('CuponesCanjeados')
    .select('codigo_cupon')
    .eq('usuario_email', userEmail);

  if (errorCupones || errorCanjes) {
    list.innerHTML = "<p style='opacity:0.7; color: #ff8a8a;'>Error al sincronizar con Supabase.</p>";
    return;
  }

  list.innerHTML = "";
  const codigosCanjeados = canjeados.map(c => c.codigo_cupon);

  // Guardamos las referencias de los elementos que necesitan temporizador
  const elementosConContador = [];

  function actualizarFiltroyRelojes() {
    const ahora = new Date();
    const diaHoy = ahora.toLocaleDateString('es-ES', { weekday: 'long' }); 
    const diaHoyFormateado = diaHoy.charAt(0).toUpperCase() + diaHoy.slice(1);

    // FILTRO MODIFICADO: Ahora permitimos cupones cuyo inicio sea FUTURO (espera de 24h)
    const cuponesVisibles = cupones.filter(cupon => {
      if (codigosCanjeados.includes(cupon.codigo)) return false; // Ya canjeado, no se muestra
      
      const fechaFin = new Date(cupon.fecha_fin);
      if (ahora > fechaFin) return false; // Ya expiró por completo, no se muestra

      // Si tiene días específicos permitidos, comprobamos hoy
      if (cupon.dias_permitidos && cupon.dias_permitidos.length > 0) {
        return cupon.dias_permitidos.includes(diaHoyFormateado);
      }
      return true;
    });

    if (cuponesVisibles.length === 0) {
      list.innerHTML = "<p style='opacity:0.7'>No tienes cupones disponibles en este momento 🎟️</p>";
      return;
    }

    // Si es la primera ejecución del ciclo, dibujamos el HTML básico
    if (list.children.length === 0) {
      cuponesVisibles.forEach((cupon, index) => {
        const fechaInicio = new Date(cupon.fecha_inicio);
        const estaEnEspera = ahora < fechaInicio; // ¿Está en las 24hs de espera?

        let itemDiv = document.createElement("div");
        itemDiv.className = "coupon-item";
        itemDiv.id = `coupon-${index}`;
        
        // Si está en espera, le aplicamos opacidad y deshabilitamos los clics
        if (estaEnEspera) {
          itemDiv.style.opacity = "0.45";
          itemDiv.style.filter = "grayscale(60%)";
          itemDiv.style.cursor = "not-allowed";
        }

        let badgeTexto = "";
        if (cupon.porcentaje_descuento !== null && cupon.porcentaje_descuento !== undefined) {
          badgeTexto = `-${cupon.porcentaje_descuento}%`;
        } else if (cupon.descripcion) {
          badgeTexto = cupon.descripcion;
        }

        let detalleInterno = cupon.descripcion ? `<b>Beneficio:</b> ${cupon.descripcion}<br>` : '';

        // Definimos la acción del clic: si está bloqueado, no hace nada
        const clickAccion = estaEnEspera 
          ? `alert('Este cupón se activará automáticamente cuando finalice la cuenta regresiva.')` 
          : `toggleCouponDesplegable('${index}')`;

        itemDiv.innerHTML = `
          <div class="coupon-header" onclick="${clickAccion}">
            <span class="coupon-text">🎟️ ${cupon.codigo}</span>
            <span id="badge-${index}" style="color: #ffeb3b; font-weight: bold; font-size: 14px; text-align: right; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${estaEnEspera ? '⏳ Bloqueado' : badgeTexto + ' 👇'}
            </span>
          </div>
          <div class="coupon-body" id="body-${index}">
            <div class="coupon-details">
              ${detalleInterno}
              <strong>Válido hasta:</strong> ${new Date(cupon.fecha_fin).toLocaleString('es-ES')}<br>
              Muestra este código QR en caja para aplicar tu beneficio.
            </div>
            <div class="qr-container" id="qr-${index}"></div>
          </div>
        `;

        list.appendChild(itemDiv);

        // Guardamos los datos para procesar el contador si está en espera
        if (estaEnEspera) {
          elementosConContador.push({ index, fechaInicio, itemDiv, badgeTexto, codigo: cupon.codigo, userEmail });
        } else {
          // Si ya está activo de una, le generamos el código QR de inmediato
          generarQRUnico(index, userEmail, cupon.codigo);
        }
      });
    }

    // Actualizamos los textos de los contadores regresivos en tiempo real
    elementosConContador.forEach(item => {
      const tiempoRestante = item.fechaInicio - new Date();

      if (tiempoRestante <= 0) {
        // ¡El tiempo terminó! Activamos el cupón en la pantalla de inmediato
        item.itemDiv.style.opacity = "1";
        item.itemDiv.style.filter = "none";
        item.itemDiv.style.cursor = "pointer";
        
        const header = item.itemDiv.querySelector('.coupon-header');
        header.setAttribute('onclick', `toggleCouponDesplegable('${item.index}')`);
        
        document.getElementById(`badge-${item.index}`).innerText = `${item.badgeTexto} 👇`;
        
        // Le generamos su QR correspondiente ahora que ya es utilizable
        generarQRUnico(item.index, item.userEmail, item.codigo);
      } else {
        // Calculamos Horas y Minutos restantes
        const totalMinutos = Math.floor(tiempoRestante / (1000 * 60));
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;

        // Formateamos para que siempre muestre dos dígitos (Ej: 05h : 09m)
        const horasStr = horas.toString().padStart(2, '0');
        const minutosStr = minutos.toString().padStart(2, '0');

        document.getElementById(`badge-${item.index}`).innerText = `⏳ Disponible en ${horasStr}:${minutosStr}`;
      }
    });
  }

  // Ejecutamos la función por primera vez de inmediato
  actualizarFiltroyRelojes();

  // Dejamos corriendo un intervalo que actualiza los minutos cada 10 segundos para máxima precisión
  intervalCupones = setInterval(actualizarFiltroyRelojes, 10000);
}

// Función auxiliar limpia para evitar duplicar código QR
function generarQRUnico(index, email, codigo) {
  const contenedorQR = document.getElementById(`qr-${index}`);
  if (contenedorQR && contenedorQR.children.length === 0) {
    const stringQR = `${email}|${codigo}`;
    new QRCode(contenedorQR, {
      text: stringQR,
      width: 130,
      height: 130,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  }
}

function toggleCouponDesplegable(index) {
  const elemento = document.getElementById(`coupon-${index}`);
  if (!elemento) return;
  const yaAbierto = elemento.classList.contains("open");
  
  document.querySelectorAll('.coupon-item').forEach(item => {
    item.classList.remove("open");
  });

  if (!yaAbierto) elemento.classList.add("open");
}

function showApp() {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("register-section").classList.add("hidden");
  document.getElementById("app-section").classList.remove("hidden");
  renderCoupons();
}

function showLogin() {
  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("register-section").classList.add("hidden");
  document.getElementById("app-section").classList.add("hidden");
  document.getElementById("admin-panel").classList.add("hidden");
}

function showRegister() {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("register-section").classList.remove("hidden");
}


// ===== 6. PANEL DE ADMINISTRADOR & CÁMARA =====
function showAdminPanel() {
  let isAdmin = localStorage.getItem("isAdmin");
  if (isAdmin === "true") {
    document.getElementById("admin-panel").classList.remove("hidden");
    renderUsers();
  }
}

// NUEVAS FUNCIONES PARA EL MANEJO DE LA CÁMARA

function iniciarEscaneoCamara() {
  if (html5QrcodeScanner) {
    alert("La cámara ya está encendida.");
    return;
  }

  // Validación preventiva de entorno seguro (HTTPS)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    alert("⚠️ Para activar la cámara desde el móvil, necesitas ingresar mediante HTTPS o configurar un túnel seguro (como Ngrok), ya que los navegadores bloquean la cámara en conexiones HTTP normales.");
    return;
  }

  html5QrcodeScanner = new Html5Qrcode("reader");
  
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrcodeScanner.start(
    { facingMode: "environment" }, 
    config,
    onQrScanSuccess
  ).catch(err => {
    alert("Error al acceder a la cámara: " + err);
    html5QrcodeScanner = null;
  });
}

async function onQrScanSuccess(decodedText) {
  // El texto capturado vendrá con el formato: "correo@prueba.com|CUPON10"
  if (!decodedText.includes("|")) {
    alert("Código QR inválido para el sistema.");
    return;
  }

  // Detener la cámara momentáneamente para procesar de forma segura
  detenerEscaneoCamara();

  const [emailUsuario, codigoCupon] = decodedText.split("|");

  const confirmar = confirm(`¿Canjear cupón '${codigoCupon}' al usuario ${emailUsuario}?`);
  if (!confirmar) {
    iniciarEscaneoCamara(); // Reanudar si cancela
    return;
  }

  // Registrar el canje en la tabla 'CuponesCanjeados'
  const { error } = await supabaseClient
    .from('CuponesCanjeados')
    .insert([
      {
        usuario_email: emailUsuario,
        codigo_cupon: codigoCupon
      }
    ]);

  if (error) {
    alert("Error al procesar el canje en Supabase: " + error.message);
    iniciarEscaneoCamara();
    return;
  }

  alert(`¡Éxito! El cupón '${codigoCupon}' fue procesado y removido de la cuenta de ${emailUsuario}.`);
  
  // Reiniciar la cámara para el siguiente cliente
  iniciarEscaneoCamara();
}

function detenerEscaneoCamara() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
      document.getElementById("reader").innerHTML = ""; // Limpia interfaz visual
    }).catch(err => console.error("Error al apagar cámara", err));
  }
}

async function crearCuponAdminSupabase() {
  const codigo = document.getElementById("newCouponCode").value.trim().toUpperCase();
  const descuentoRaw = document.getElementById("newCouponDiscount").value;
  const descripcion = document.getElementById("newCouponDescription").value.trim();
  const fechaInicio = document.getElementById("newCouponStart").value;
  const fechaFin = document.getElementById("newCouponEnd").value;

  const checkboxes = document.querySelectorAll('input[name="couponDays"]:checked');
  const diasPermitidos = Array.from(checkboxes).map(cb => cb.value);

  // Validaciones básicas
  if (!codigo || !fechaInicio || !fechaFin) {
    return alert("Por favor, completa obligatoriamente el código y ambas fechas.");
  }

  // Comprobar que al menos insertó un porcentaje o una descripción
  if (!descuentoRaw && !descripcion) {
    return alert("Debes rellenar al menos el porcentaje de descuento o una descripción del beneficio.");
  }

  const descuento = descuentoRaw ? parseInt(descuentoRaw) : null;
  const diasFormateadosPostgres = diasPermitidos.length > 0 ? `{${diasPermitidos.join(',')}}` : null;

  const { data, error } = await supabaseClient
    .from('Cupones')
    .insert([
      {
        codigo: codigo,
        porcentaje_descuento: descuento, // Guardará null si se dejó vacío
        descripcion: descripcion || null, // Guardará null si se dejó vacío
        fecha_inicio: new Date(fechaInicio).toISOString(),
        fecha_fin: new Date(fechaFin).toISOString(),
        dias_permitidos: diasFormateadosPostgres
      }
    ]);

  if (error) {
    return alert("Error al conectar con Supabase: " + error.message);
  }

  alert(`¡Cupón '${codigo}' guardado exitosamente en Supabase!`);

  // Limpiar el formulario
  document.getElementById("newCouponCode").value = "";
  document.getElementById("newCouponDiscount").value = "";
  document.getElementById("newCouponDescription").value = "";
  document.getElementById("newCouponStart").value = "";
  document.getElementById("newCouponEnd").value = "";
  checkboxes.forEach(cb => cb.checked = false);
}

function renderUsers() {
  let users = getUsers();
  let list = document.getElementById("usersList");
  if (!list) return;
  let searchInput = document.getElementById("searchUser");
  let search = searchInput ? searchInput.value.toLowerCase() : "";

  list.innerHTML = "";

  let filtered = Object.keys(users).filter(user => user.toLowerCase().includes(search));

  if (filtered.length === 0) {
    list.innerHTML = "<li>No se encontraron usuarios</li>";
    return;
  }

  filtered.forEach(user => {
    let li = document.createElement("li");
    li.innerHTML = `
      <span>👤 <b>${user}</b> - 🔑 <span style="opacity:0.6; font-style:italic;">[Autenticación Protegida]</span></span>
      <button onclick="deleteUser('${user}')" class="delete-btn" style="margin-left: 10px;">Eliminar</button>
    `;
    list.appendChild(li);
  });
}

function deleteUser(user) {
  let users = getUsers();
  if (!users[user]) return;

  let confirmDelete = confirm("¿Seguro que quieres eliminar a " + user + "?");
  if (!confirmDelete) return;

  delete users[user];
  saveUsers(users);

  localStorage.removeItem("coupons_" + user);
  renderUsers();
}