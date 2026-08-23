/** @type {import('tailwindcss').Config} */
export default {
    content: ["./public/**/*.html", "./public/**/*.js"],
    theme: {
        extend: {
            fontFamily: { sans: ['"Plus Jakarta Sans"', "sans-serif"] },
            colors: {
                seashell: "#F6C992",
                garnet: "#30525C",
                iceblue: "#ACC0D3",
                rose: "#D396A6",
                tealaccent: "#09A1A1",
                steel: "#5484A4",
                brand: {
                    50: "#f0fdfd",
                    100: "#acc0d3",
                    500: "#09a1a1",
                    600: "#30525c",
                    700: "#223c44",
                    900: "#15252b",
                },
                auth: {
                    50: "#eef2ff",
                    100: "#e0e7ff",
                    500: "#6366f1",
                    600: "#4f46e5",
                    700: "#4338ca",
                },
            },
        },
    },
    plugins: [],
};
