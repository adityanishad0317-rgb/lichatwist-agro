/* =========================================
   LICHATWIST PUBLIC THEME SYSTEM
========================================= */

const LICHATWIST_THEMES = {

  classic: {

    navy:
      "#061a33",

    navy2:
      "#0b294d",

    blue:
      "#0d4f8b",

    blueLight:
      "#1d75b9",

    gold:
      "#d7ad4a",

    goldLight:
      "#f0d28a",

    offWhite:
      "#f5f7fa",

    text:
      "#182638",

    muted:
      "#68778a",

    rgbNavy:
      "6,26,51",

    rgbGold:
      "215,173,74"

  },


  ocean: {

    navy:
      "#06283d",

    navy2:
      "#0b4f6c",

    blue:
      "#136f8a",

    blueLight:
      "#2c9ab7",

    gold:
      "#22c1c3",

    goldLight:
      "#8be9ea",

    offWhite:
      "#f2fbfc",

    text:
      "#16313d",

    muted:
      "#5d7884",

    rgbNavy:
      "6,40,61",

    rgbGold:
      "34,193,195"

  },


  emerald: {

    navy:
      "#062d24",

    navy2:
      "#0b4f3a",

    blue:
      "#0f766e",

    blueLight:
      "#14b8a6",

    gold:
      "#34d399",

    goldLight:
      "#a7f3d0",

    offWhite:
      "#f0fdf9",

    text:
      "#17332c",

    muted:
      "#607a72",

    rgbNavy:
      "6,45,36",

    rgbGold:
      "52,211,153"

  },


  purple: {

    navy:
      "#211134",

    navy2:
      "#4c1d95",

    blue:
      "#6d28d9",

    blueLight:
      "#8b5cf6",

    gold:
      "#c084fc",

    goldLight:
      "#ddd6fe",

    offWhite:
      "#faf7ff",

    text:
      "#2e2140",

    muted:
      "#756985",

    rgbNavy:
      "33,17,52",

    rgbGold:
      "192,132,252"

  },


  sunset: {

    navy:
      "#3b1608",

    navy2:
      "#7c2d12",

    blue:
      "#c2410c",

    blueLight:
      "#ea580c",

    gold:
      "#f59e0b",

    goldLight:
      "#fed7aa",

    offWhite:
      "#fffaf5",

    text:
      "#3d271b",

    muted:
      "#806a5b",

    rgbNavy:
      "59,22,8",

    rgbGold:
      "245,158,11"

  },


  slate: {

    navy:
      "#1e293b",

    navy2:
      "#334155",

    blue:
      "#475569",

    blueLight:
      "#64748b",

    gold:
      "#94a3b8",

    goldLight:
      "#cbd5e1",

    offWhite:
      "#f8fafc",

    text:
      "#1e293b",

    muted:
      "#64748b",

    rgbNavy:
      "30,41,59",

    rgbGold:
      "148,163,184"

  },


  earth: {

    navy:
      "#2f2118",

    navy2:
      "#5c4030",

    blue:
      "#795548",

    blueLight:
      "#9a6b4f",

    gold:
      "#c58b4e",

    goldLight:
      "#e4c39a",

    offWhite:
      "#fbf7f2",

    text:
      "#382b22",

    muted:
      "#796b60",

    rgbNavy:
      "47,33,24",

    rgbGold:
      "197,139,78"

  }

};


/* =========================================
   APPLY PUBLIC THEME
========================================= */

function applyLichaTwistTheme(
  themeKey
){

  const theme =
    LICHATWIST_THEMES[
      themeKey
    ] ||
    LICHATWIST_THEMES.classic;


  const root =
    document.documentElement;


  root.style.setProperty(
    "--navy",
    theme.navy
  );

  root.style.setProperty(
    "--navy-2",
    theme.navy2
  );

  root.style.setProperty(
    "--blue",
    theme.blue
  );

  root.style.setProperty(
    "--blue-light",
    theme.blueLight
  );

  root.style.setProperty(
    "--gold",
    theme.gold
  );

  root.style.setProperty(
    "--gold-light",
    theme.goldLight
  );

  root.style.setProperty(
    "--off-white",
    theme.offWhite
  );

  root.style.setProperty(
    "--text",
    theme.text
  );

  root.style.setProperty(
    "--muted",
    theme.muted
  );


  root.style.setProperty(
    "--theme-navy-rgb",
    theme.rgbNavy
  );

  root.style.setProperty(
    "--theme-gold-rgb",
    theme.rgbGold
  );


  /*
   * These overrides handle the small number
   * of existing stylesheet elements that use
   * fixed colors instead of CSS variables.
   */

  let style =
    document.getElementById(
      "lichatwistThemeOverrides"
    );


  if(!style){

    style =
      document.createElement(
        "style"
      );

    style.id =
      "lichatwistThemeOverrides";

    document.head.appendChild(
      style
    );

  }


  style.textContent = `

    .site-header{
      border-bottom-color:
        rgba(
          var(--theme-gold-rgb),
          .35
        ) !important;
    }


    .site-header.scrolled{
      background:
        rgba(
          var(--theme-navy-rgb),
          .96
        ) !important;
    }


    .hero-section{
      background:
        var(--navy) !important;
    }


    .hero-overlay{
      background:
        linear-gradient(
          90deg,
          rgba(
            var(--theme-navy-rgb),
            .96
          ) 0%,
          rgba(
            var(--theme-navy-rgb),
            .82
          ) 42%,
          rgba(
            var(--theme-navy-rgb),
            .42
          ) 72%,
          rgba(
            var(--theme-navy-rgb),
            .68
          ) 100%
        ) !important;
    }


    .nav-contact{
      border-color:
        rgba(
          var(--theme-gold-rgb),
          .65
        ) !important;
    }


    .nav-contact:hover{
      background:
        var(--gold) !important;

      color:
        var(--navy) !important;
    }


    .primary-button{
      background:
        var(--gold) !important;

      color:
        var(--navy) !important;
    }


    .primary-button:hover{
      background:
        var(--gold-light) !important;
    }


    .hero-label,
    .hero-content h1 span,
    .hero-trust .trust-item strong{
      color:
        var(--gold-light) !important;
    }


    .hero-line{
      background:
        var(--gold) !important;
    }


    .section-tag,
    .projects-tag,
    .service-number,
    .principle-number{
      color:
        var(--gold) !important;
    }


    .service-icon,
    .principle-icon,
    .contact-icon{
      color:
        var(--gold) !important;
    }


    .premium-service-card:hover,
    .company-feature-card:hover,
    .project-card:hover{
      border-color:
        rgba(
          var(--theme-gold-rgb),
          .45
        ) !important;
    }


    .premium-footer{
      background:
        var(--navy) !important;
    }

  `;


  document.body.dataset.theme =
    themeKey;


  localStorage.setItem(
    "lichatwist-theme",
    themeKey
  );

}


/* =========================================
   LOAD PUBLIC THEME
========================================= */

async function loadPublicTheme(){

  /*
   * Apply the last known theme immediately
   * so the page does not wait for the API.
   */

  const cachedTheme =
    localStorage.getItem(
      "lichatwist-theme"
    );


  if(cachedTheme){

    applyLichaTwistTheme(
      cachedTheme
    );

  }else{

    applyLichaTwistTheme(
      "classic"
    );

  }


  try{

    const response =
      await fetch(
        "/api/public-theme",
        {
          method:
            "GET",

          cache:
            "no-store"
        }
      );


    if(!response.ok){

      return;

    }


    const data =
      await response.json();


    if(
      data.success &&
      data.theme
    ){

      applyLichaTwistTheme(
        data.theme
      );

    }


  }catch(error){

    console.log(
      "Public theme could not be loaded.",
      error
    );

  }

}

async function loadWebsiteContent() {

  try {

    const response = await fetch(
      "/api/public-content",
      {
        method: "GET",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      console.log("Public content request failed.");
      return;
    }

    const data = await response.json();

    if (!data.success || !data.content) {
      console.log("No public content received.");
      return;
    }

    const content = data.content;
        /*
     * =========================
     * IMAGE CACHE VERSION
     * =========================
     */

    const imageVersion =
      encodeURIComponent(
        content.updated_at || Date.now()
      );

    function imageUrl(path) {

      if (!path) {
        return "";
      }

      return (
        path +
        (path.includes("?") ? "&" : "?") +
        "v=" +
        imageVersion
      );

    }
    /*
     * =========================
     * CONTACT INFORMATION
     * =========================
     */

    const phone = content.phone || "";
    const email = content.email || "";
    const address = content.address || "";
    const whatsapp = content.whatsapp || "";
    
    const businessName =
     content.business_name || "";


    /*
     * =========================
     * PHONE / EMAIL / ADDRESS
     * =========================
     */

    document
      .querySelectorAll("[data-content]")
      .forEach(element => {

        const field =
          element.getAttribute("data-content");

        if (field === "phone") {
          element.textContent = phone;
        }

        if (field === "email") {
          element.textContent = email;
        }

        if (field === "address") {
          element.textContent = address;
        }
        if (field === "business_name") {
  element.innerHTML =
    businessName + "<sup>®</sup>";
        }

      });


    /*
     * =========================
     * PHONE LINKS
     * =========================
     */

    if (phone) {

      const cleanPhone =
        phone.replace(/[^\d+]/g, "");

      document
        .querySelectorAll('a[href^="tel:"]')
        .forEach(link => {

          link.href =
            "tel:" + cleanPhone;

        });

    }
    if (phone) {

  const cleanPhone =
    phone.replace(/[^\d+]/g, "");

  document
    .querySelectorAll("[data-phone-footer]")
    .forEach(link => {

      link.href =
        "tel:" + cleanPhone;

    });

}


    /*
     * =========================
     * EMAIL LINKS
     * =========================
     */

    if (email) {

      document
        .querySelectorAll('a[href^="mailto:"]')
        .forEach(link => {

          link.href =
            "mailto:" + email.trim();

        });

    }


    /*
     * =========================
     * WHATSAPP LINKS
     * =========================
     */

    if (whatsapp) {

      const whatsappNumber =
        whatsapp.replace(/\D/g, "");

      document
        .querySelectorAll('a[href*="wa.me/"]')
        .forEach(link => {

          link.href =
            "https://wa.me/" +
            whatsappNumber;

        });

    }


    /*
     * =========================
     * FLOATING PHONE BUTTON
     * =========================
     */

    if (phone) {

      const cleanPhone =
        phone.replace(/[^\d+]/g, "");

      document
        .querySelectorAll("[data-phone-button]")
        .forEach(button => {

          button.href =
            "tel:" + cleanPhone;

        });

    }


    /*
     * =========================
     * EMAIL BUTTONS
     * =========================
     */

    if (email) {

      document
        .querySelectorAll("[data-email-button]")
        .forEach(button => {

          button.href =
            "mailto:" + email.trim();

        });

    }


    /*
     * =========================
     * HERO
     * =========================
     */

    if (content.hero_title) {

      const el =
        document.getElementById("heroTitle");

      if (el) {
        el.textContent =
          content.hero_title;
      }

    }


    if (content.hero_subtitle) {

      const el =
        document.getElementById("heroSubtitle");

      if (el) {
        el.textContent =
          content.hero_subtitle;
      }

    }


    if (content.hero_description) {

      const el =
        document.getElementById("heroDescription");

      if (el) {
        el.textContent =
          content.hero_description;
      }

    }


    /*
     * =========================
     * ABOUT
     * =========================
     */

    if (content.about_heading) {

      const el =
        document.getElementById("aboutHeading");

      if (el) {
        el.textContent =
          content.about_heading;
      }

    }


    if (content.about_description) {

      const el =
        document.getElementById("aboutDescription");

      if (el) {
        el.textContent =
          content.about_description;
      }

    }


    /*
     * =========================
     * MISSION
     * =========================
     */

    if (content.mission) {

      const el =
        document.getElementById("missionText");

      if (el) {
        el.textContent =
          content.mission;
      }

    }


    /*
     * =========================
     * VISION
     * =========================
     */

    if (content.vision) {

      const el =
        document.getElementById("visionText");

      if (el) {
        el.textContent =
          content.vision;
      }

    }


    /*
     * =========================
     * VALUES
     * =========================
     */

    if (content.values_text) {

      const el =
        document.getElementById("valuesText");

      if (el) {
        el.textContent =
          content.values_text;
      }

    }


    /*
     * =========================
     * SERVICES
     * =========================
     */

    if (content.agriculture_title) {

      const el =
        document.getElementById("agricultureTitle");

      if (el) {
        el.textContent =
          content.agriculture_title;
      }

    }


    if (content.agriculture_description) {

      const el =
        document.getElementById("agricultureDescription");

      if (el) {
        el.textContent =
          content.agriculture_description;
      }

    }


    if (content.construction_title) {

      const el =
        document.getElementById("constructionTitle");

      if (el) {
        el.textContent =
          content.construction_title;
      }

    }


    if (content.construction_description) {

      const el =
        document.getElementById("constructionDescription");

      if (el) {
        el.textContent =
          content.construction_description;
      }

    }


    if (content.transport_title) {

      const el =
        document.getElementById("transportTitle");

      if (el) {
        el.textContent =
          content.transport_title;
      }

    }


    if (content.transport_description) {

      const el =
        document.getElementById("transportDescription");

      if (el) {
        el.textContent =
          content.transport_description;
      }

    }
/*
 * =========================
 * SERVICE IMAGES
 * =========================
 */

if (content.agriculture_image) {

  const el =
    document.getElementById("agricultureServiceImage");

  if (el) {
    el.src =
     imageUrl(content.agriculture_image)
  }

}


if (content.construction_image) {

  const el =
    document.getElementById("constructionServiceImage");

  if (el) {
    el.src =
  imageUrl(content.construction_image);
  }

}


if (content.transport_image) {

  const el =
    document.getElementById("transportServiceImage");

  if (el) {
    el.src =
  imageUrl(content.transport_image);
  }

}

    /*
     * =========================
     * COMPANIES
     * =========================
     */

    if (content.agro_company_name) {

      const el =
        document.getElementById("agroCompanyName");

      if (el) {
        el.textContent =
          content.agro_company_name;
      }

    }


    if (content.agro_company_description) {

      const el =
        document.getElementById("agroCompanyDescription");

      if (el) {
        el.textContent =
          content.agro_company_description;
      }

    }


    if (content.construction_company_name) {

      const el =
        document.getElementById("constructionCompanyName");

      if (el) {
        el.textContent =
          content.construction_company_name;
      }

    }


    if (content.construction_company_description) {

      const el =
        document.getElementById(
          "constructionCompanyDescription"
        );

      if (el) {
        el.textContent =
          content.construction_company_description;
      }

    }


    if (content.transport_company_name) {

      const el =
        document.getElementById("transportCompanyName");

      if (el) {
        el.textContent =
          content.transport_company_name;
      }

    }


    if (content.transport_company_description) {

      const el =
        document.getElementById(
          "transportCompanyDescription"
        );

      if (el) {
        el.textContent =
          content.transport_company_description;
      }

    }
/*
 * =========================
 * COMPANY IMAGES
 * =========================
 */

if (content.agro_company_image) {

  const el =
    document.getElementById("agroCompanyImage");

  if (el) {
    el.src =
  imageUrl(content.agro_company_image);
  }

}


if (content.construction_company_image) {

  const el =
    document.getElementById("constructionCompanyImage");

  if (el) {
    el.src =
  imageUrl(content.construction_company_image);
  }

}


if (content.transport_company_image) {

  const el =
    document.getElementById("transportCompanyImage");

  if (el) {
    el.src =
  imageUrl(content.transport_company_image);
  }

}

   /*
 * =========================
 * PROJECTS
 * =========================
 */

if (content.projects_heading) {

  const el =
    document.getElementById("projectsHeading");

  if (el) {
    el.textContent =
      content.projects_heading;
  }

}


if (content.projects_description) {

  const el =
    document.getElementById("projectsDescription");

  if (el) {
    el.textContent =
      content.projects_description;
  }

}
/* PROJECT IMAGES */

if (content.project1_image) {

  const el =
    document.getElementById("project1Image");

  if (el) {
    el.src =
  imageUrl(content.project1_image);
  }

}


if (content.project2_image) {

  const el =
    document.getElementById("project2Image");

  if (el) {
    el.src =
  imageUrl(content.project2_image);
  }

}


if (content.project3_image) {

  const el =
    document.getElementById("project3Image");

  if (el) {
    el.src =
  imageUrl(content.project3_image);
  }

}
/* PROJECT 1 */

if (content.project1_category) {

  const el =
    document.getElementById("project1Category");

  if (el) {
    el.textContent =
      content.project1_category;
  }

}


if (content.project1_title) {

  const el =
    document.getElementById("project1Title");

  if (el) {
    el.textContent =
      content.project1_title;
  }

}


if (content.project1_description) {

  const el =
    document.getElementById("project1Description");

  if (el) {
    el.textContent =
      content.project1_description;
  }

}


/* PROJECT 2 */

if (content.project2_category) {

  const el =
    document.getElementById("project2Category");

  if (el) {
    el.textContent =
      content.project2_category;
  }

}


if (content.project2_title) {

  const el =
    document.getElementById("project2Title");

  if (el) {
    el.textContent =
      content.project2_title;
  }

}


if (content.project2_description) {

  const el =
    document.getElementById("project2Description");

  if (el) {
    el.textContent =
      content.project2_description;
  }

}


/* PROJECT 3 */

if (content.project3_category) {

  const el =
    document.getElementById("project3Category");

  if (el) {
    el.textContent =
      content.project3_category;
  }

}


if (content.project3_title) {

  const el =
    document.getElementById("project3Title");

  if (el) {
    el.textContent =
      content.project3_title;
  }

}


if (content.project3_description) {

  const el =
    document.getElementById("project3Description");

  if (el) {
    el.textContent =
      content.project3_description;
  }

}

    console.log(
      "LichaTwist website content loaded successfully."
    );

  } catch (error) {

    console.log(
      "Website content could not be loaded.",
      error
    );

  }

}


loadPublicTheme();
loadWebsiteContent();
