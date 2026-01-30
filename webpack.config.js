var path = require("path");
const webpack = require("webpack");

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const devMode = false;
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  output: {
    path: path.resolve(__dirname, "../GLSDk-for-woocommerce/assets/js"),
    filename: "[name].js",
    publicPath: "/GLSDk-for-woocommerce/assets/js",
  },
  mode: "production",
  entry: {
    GLSDk: "./GLSDk.js",
    "GLSDk-admin": "./GLSDk-admin.js",
    "GLSDk-wcfm": "./js/GLSDk-wcfm.js",
    "GLSDk-dokan": "./js/GLSDk-dokan.js",
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  plugins: [
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: "../css/[name].css",
      chunkFilename: devMode ? "[id].css" : "[id].[hash].css",
    }),
  ],
  resolve: {
    extensions: [".js", ".json"],
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ["babel-loader"],
      },
      {
        test: /\.(png|jpg|gif)$/i,
        use: [
          {
            loader: "url-loader",
            options: {
              limit: 8192,
            },
          },
        ],
      },
      {
        test: /(\.scss|\.css)$/, //css is necessary if we import libs that use it.
        use: [
          MiniCssExtractPlugin.loader,
          { loader: "css-loader", options: { url: false, sourceMap: true } },
          {
            loader: "sass-loader",
            options: { sourceMap: true, implementation: require("sass") },
          },
        ],
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[name].[ext]",
              outputPath: "fonts/",
            },
          },
        ],
      },
    ],
  },
};
