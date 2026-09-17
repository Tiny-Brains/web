# Model format

Submit a self-contained ONNX file named `model.onnx`, alongside `manifest.json`. A node reads the
graph from the protobuf, builds a plan for it under **tract**, and runs it against the tensors your
adapters actually produce. Training code and framework are your choice; the exported artifact must
work within the deployed runtime and admission policy.

## ONNX compatibility

The current deployment accepts ONNX opsets **13 through 19**, inclusive, and applies an operator
allowlist. A graph loading on your development machine does not prove it meets these rules. Avoid
external weight files: the contract is one model file and one manifest file, and a graph that
points at weights beside it has nothing to point at.

The currently configured operator names are:

```text
Abs Add And ArgMax ArgMin AveragePool BatchNormalization Cast Ceil
Clip Concat Constant ConstantOfShape Conv Div Elu Equal Erf Exp
Expand Flatten Floor Gather GatherElements Gemm GlobalAveragePool
GlobalMaxPool Greater HardSigmoid Identity InstanceNormalization
LayerNormalization LeakyRelu Less Log LogSoftmax MatMul Max MaxPool
Mean Min Mul Neg Not Or Pad Pow PRelu Range Reciprocal ReduceMax
ReduceMean ReduceMin ReduceSum Relu Reshape Resize Selu Shape Sigmoid
Sign Slice Softmax Softplus Split Sqrt Squeeze Sub Sum Tanh Tile
Transpose Unsqueeze Where
```

This is the deployment's policy snapshot, not a promise that every operator/type combination will
execute. In particular, do not infer that an unlisted variant such as `GatherND` is allowed because
a related operator is listed. Admission reads the operators out of the document — every one of them,
including the ones inside an `If`, `Loop` or `Scan` body and inside a model-local function — so
inspect what your exporter actually emitted rather than what you wrote.

**The list narrows what the runtime serves; it never widens it.** A season may publish a shorter
list of its own, and it is intersected with this one rather than replacing it: a season cannot
allow an operator the runtime cannot run, because that would admit a model that then fails at
play — a rejection deferred to the worst possible moment.

### Attributes are not operators

The allowlist names operators, not the attributes they carry. `Conv` is listed, so a **dilated**
convolution is allowed: dilation is an attribute of `Conv` in ONNX rather than an operator of its
own, and a dilated graph inspects as `Conv` like any other. The same reasoning covers strides,
groups and asymmetric kernels.

This is worth knowing because the observation is a board and your graph's **receptive field** — how
far from a cell its output can be influenced by — bounds what a unit standing there can respond to.
A stack of ordinary 3x3 convolutions grows that by two cells a layer. Doubling the dilation grows it
exponentially, so four layers reach fifteen cells each way for the same parameters that three
undilated layers spend reaching three.

The platform has no opinion about your architecture. It is mentioned only because "which operators
may I use" is a question the allowlist answers and "may I dilate one of them" is a question it looks
like it does not.

## Inputs and outputs

**The manifest names them and the names must be the graph's own.** Each entry in `inputs` gives a
graph input's name, dtype and shape, plus the adapter that builds it; each entry in `outputs` gives
an output's name, dtype and shape. They are read from `graph.input` and `graph.output` in the
document — the tensor names, not the names of the nodes that produce them, which an exporter picks
freely and calls things like `/fc2/Gemm`.

Boundary dtypes are `bool`, `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `i64`, `u64`, `f32` and `f64`.
Match the ONNX boundary types explicitly; an internal graph dtype does not automatically make it a
boundary dtype, and a `float16` *initializer* under a `Cast` is a `f32` boundary.

**Support every board size.** A dimension may be a name
([how](adapters.md#a-dimension-may-be-a-name)), so a fully convolutional graph declares
`[1, P, "H", "W"]` and one admitted session serves every preset. A graph that computes indices
internally cannot name its spatial axes — the runtime cannot type-check that against a symbol — and
must declare concrete ones, which means it plays one board size and is refused by the others.

No persistent hidden state is carried between turns.

## How size is measured

The competition metric is:

```text
S' = bytes(model.onnx) + bytes(manifest.json)
```

Nothing is compressed and nothing is estimated. Both terms are measured by the node against digests
it re-hashes, so **no way of packing your weights into the file can understate it**. `tinybrains
check` reports it as `size metric`.

> **This changed on 14 September 2026, and every class cap doubled with it.** The old metric
> compressed the graph's *initializers* and the adapter file, which is a hole: a graph carrying its
> trained weights as `Constant` node attributes has no initializers at all and measured as nearly
> nothing. The caps moved so that the parameter budget each class was calibrated for is the one it
> still has.

Admission assigns the smallest [weight class](weight-classes.md) that fits `S'`. Parameter count is
reported beside it and does not assign your class — though a season may cap it independently, and
that count is now every value the document carries, wherever it carries it.

Hashes identify the exact files, so even a formatting-only manifest edit changes your hash and your
size.

## What is inspected

Admission re-hashes both files against what you declared, reads the graph from the protobuf —
parameters, nodes, operators, IR version, opset — builds a plan and runs five inferences on
zero-filled inputs at your `probe_dims`, then applies the platform's policy to what it measured and
runs your manifest over the game's reference observations. It reports the input shapes actually
used, what each adapter charged, and the measured inference time. **That time is reported, never a
threshold**: no class caps your compute, and the bound that matters is the turn deadline at play.

Use [Testing before you submit](testing.md) to make the same measurements locally with the same two
libraries. Passing establishes compatibility on the reference cases; it does not prove playing
strength or guarantee every future observation fits your budget.
