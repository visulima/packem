// CSS modules
type CSSModuleClasses = Readonly<Record<string, string>>;

declare module "*.module.css" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.scss" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.sass" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.less" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.styl" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.stylus" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.pcss" {
    const classes: CSSModuleClasses;

    export default classes;
}
declare module "*.module.sss" {
    const classes: CSSModuleClasses;

    export default classes;
}

// CSS
declare module "*.css" {}
declare module "*.scss" {}
declare module "*.sass" {}
declare module "*.less" {}
declare module "*.styl" {}
declare module "*.stylus" {}
declare module "*.pcss" {}
declare module "*.sss" {}

// Built-in asset types
// see `src/node/constants.ts`

// images
declare module "*.apng" {
    const source: string;

    export default source;
}
declare module "*.bmp" {
    const source: string;

    export default source;
}
declare module "*.png" {
    const source: string;

    export default source;
}
declare module "*.jpg" {
    const source: string;

    export default source;
}
declare module "*.jpeg" {
    const source: string;

    export default source;
}
declare module "*.jfif" {
    const source: string;

    export default source;
}
declare module "*.pjpeg" {
    const source: string;

    export default source;
}
declare module "*.pjp" {
    const source: string;

    export default source;
}
declare module "*.gif" {
    const source: string;

    export default source;
}
declare module "*.svg" {
    const source: string;

    export default source;
}
declare module "*.ico" {
    const source: string;

    export default source;
}
declare module "*.webp" {
    const source: string;

    export default source;
}
declare module "*.avif" {
    const source: string;

    export default source;
}
declare module "*.cur" {
    const source: string;

    export default source;
}

// media
declare module "*.mp4" {
    const source: string;

    export default source;
}
declare module "*.webm" {
    const source: string;

    export default source;
}
declare module "*.ogg" {
    const source: string;

    export default source;
}
declare module "*.mp3" {
    const source: string;

    export default source;
}
declare module "*.wav" {
    const source: string;

    export default source;
}
declare module "*.flac" {
    const source: string;

    export default source;
}
declare module "*.aac" {
    const source: string;

    export default source;
}
declare module "*.opus" {
    const source: string;

    export default source;
}
declare module "*.mov" {
    const source: string;

    export default source;
}
declare module "*.m4a" {
    const source: string;

    export default source;
}
declare module "*.vtt" {
    const source: string;

    export default source;
}

// fonts
declare module "*.woff" {
    const source: string;

    export default source;
}
declare module "*.woff2" {
    const source: string;

    export default source;
}
declare module "*.eot" {
    const source: string;

    export default source;
}
declare module "*.ttf" {
    const source: string;

    export default source;
}
declare module "*.otf" {
    const source: string;

    export default source;
}

// other
declare module "*.txt" {
    const source: string;

    export default source;
}

declare module "*?raw" {
    const source: string;

    export default source;
}
