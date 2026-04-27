---
title: Math
tags: [math, latex, katex]
---

# Math

Obsidianator renders math using KaTeX. Use `$...$` for inline math and `$$...$$` for display (block) math.

## Inline Math

Einstein's mass-energy equivalence: $E = mc^2$

The quadratic formula gives roots $x = \dfrac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ for $ax^2 + bx + c = 0$.

Euler's identity is often called the most beautiful equation in mathematics: $e^{i\pi} + 1 = 0$

The probability density of a normal distribution: $f(x) = \dfrac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}$

## Display Math

### Calculus

The fundamental theorem of calculus:

$$\int_a^b f(x)\,dx = F(b) - F(a)$$

Fourier transform:

$$\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx$$

### Linear Algebra

A system of equations $A\mathbf{x} = \mathbf{b}$ where $A$ is an $n \times n$ matrix:

$$\begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{n1} & a_{n2} & \cdots & a_{nn} \end{pmatrix} \begin{pmatrix} x_1 \\ x_2 \\ \vdots \\ x_n \end{pmatrix} = \begin{pmatrix} b_1 \\ b_2 \\ \vdots \\ b_n \end{pmatrix}$$

Determinant of a $2 \times 2$ matrix:

$$\det(A) = \begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc$$

### Series & Summations

Taylor series expansion of $e^x$:

$$e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots$$

The Basel problem:

$$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$

### Limits & Derivatives

Definition of the derivative:

$$f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

L'Hôpital's rule applies when $\lim_{x \to c} f(x) = \lim_{x \to c} g(x) = 0$:

$$\lim_{x \to c} \frac{f(x)}{g(x)} = \lim_{x \to c} \frac{f'(x)}{g'(x)}$$

### Physics

Maxwell's equations in differential form:

$$\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0} \qquad \nabla \cdot \mathbf{B} = 0$$

$$\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t} \qquad \nabla \times \mathbf{B} = \mu_0\left(\mathbf{J} + \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}\right)$$

Schrödinger equation:

$$i\hbar \frac{\partial}{\partial t}\Psi(\mathbf{r},t) = \left[-\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r},t)\right]\Psi(\mathbf{r},t)$$

### Greek Letters & Symbols

Common symbols: $\alpha, \beta, \gamma, \delta, \epsilon, \zeta, \eta, \theta, \lambda, \mu, \nu, \xi, \pi, \rho, \sigma, \tau, \phi, \chi, \psi, \omega$

Set notation: $x \in \mathbb{R}$, $A \subseteq B$, $A \cup B$, $A \cap B$, $\forall x \in \mathbb{N},\ \exists y > x$
