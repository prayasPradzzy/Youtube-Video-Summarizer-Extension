const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup.tsx',
    content: './src/content.ts',
    background: './src/background.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'manifest.json', to: '.' }
      ]
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  devtool: 'cheap-module-source-map',
  optimization: {
    splitChunks: {
      chunks: (chunk) => chunk.name !== 'content',
      name: 'vendor'
    }
  },
  performance: {
    hints: false
  }
}; 