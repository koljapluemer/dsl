declare module '*.css';
declare module '*.csv' { const text: string; export default text; }
declare module '*.txt' { const text: string; export default text; }
declare module '*.svg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
