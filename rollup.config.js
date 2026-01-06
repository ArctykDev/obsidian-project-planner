import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";

export default {
  input: "src/main.ts",
  output: {
    dir: ".",
    sourcemap: true,
    format: "cjs",
    exports: "default"
  },
  external: ["obsidian"],
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
    copy({
      targets: [
        { src: "src/styles.css", dest: "." },
      ]
    })
  ]
};
