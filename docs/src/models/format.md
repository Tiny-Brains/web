# Model format

Submit a self-contained ONNX file named `model.onnx`, alongside `manifest.json`. A node reads the
graph from the protobuf, builds a plan for it under **tract**, and runs it against the tensors your
adapters produce. You choose the training code and framework; the exported file has to work within
the deployed runtime and admission policy.

## ONNX compatibility

The deployment accepts ONNX opsets **13 through 19**, inclusive, and applies an operator allowlist.
A graph that loads on your development machine can still break these rules. Keep your weights inside
the graph: the contract is one model file and one manifest file, so a graph that points at weight
files beside it finds nothing there.

The allowlist names these operators:

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

The list is a snapshot of the deployment's policy, and it does not promise that every operator/type
combination executes. An unlisted variant such as `GatherND` stays refused even when a related
operator is on the list. Admission reads every operator out of the document, including those inside
an `If`, `Loop` or `Scan` body and inside a model-local function, so inspect what your exporter
emitted: it can differ from what you wrote.

**A season's list can only narrow what the runtime serves.** A season may publish a shorter list of
its own, and the platform intersects it with this one, so a season cannot allow an operator the
runtime cannot run. Allowing one would admit a model that then fails at play, the worst moment for
a rejection.

### Attributes are not operators

The allowlist names operators and says nothing about their attributes. `Conv` is on the list, so a
**dilated** convolution is allowed: in ONNX, dilation is an attribute of `Conv`, and a dilated
graph inspects as `Conv` like any other. Strides, groups and asymmetric kernels are attributes too,
and the same holds for them.

The observation is a board, and your graph's **receptive field** (the distance from which an input
can influence a cell's output) bounds what a unit standing there can respond to. A stack of
ordinary 3x3 convolutions grows it by two cells a layer. Double the dilation at each layer and the
growth becomes a power of two. With dilations 1, 2, 4 and 8, four layers reach fifteen cells each
way; four undilated layers hold the same parameters and reach four.

The platform has no opinion about your architecture.

## Inputs and outputs

**The manifest names them, and the names must be the graph's own.** Each entry in `inputs` gives a
graph input's name, dtype and shape, plus the adapter that builds it; each entry in `outputs` gives
an output's name, dtype and shape. The node reads them from `graph.input` and `graph.output` in the
document. Those are tensor names. The nodes that produce the tensors carry names of their own, which
the exporter picks, such as `/fc2/Gemm`, and the manifest must not use them.

Boundary dtypes are `bool`, `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `i64`, `u64`, `f32` and `f64`.
Declare the ONNX boundary types as the graph has them: a dtype used inside the graph does not become
a boundary dtype, and a `float16` *initializer* under a `Cast` is an `f32` boundary.

**Support every board size.** A dimension may be a name
([how](adapters.md#a-dimension-may-be-a-name)), so a fully convolutional graph declares
`[1, P, "H", "W"]` and one admitted session serves every board a season plays, including one it adds
later. A graph that computes indices inside itself cannot name its spatial axes, because the
runtime cannot type-check that against a symbol. It must declare concrete axes, so it plays one
board size and the runtime refuses it on the others.

The node carries no hidden state from one turn to the next.

## How size is measured

The competition metric is:

```text
S' = bytes(model.onnx) + bytes(manifest.json)
```

The node compresses nothing and estimates nothing. It measures both terms against digests it
re-hashes, so **no way of packing your weights into the file can understate it**. `tinybrains
check` reports it as `size metric`.

> **Raw bytes close a hole.** A metric that compressed the graph's *initializers* would miss a
> graph that carries its trained weights as `Constant` node attributes: that graph has no
> initializers at all, and would measure as almost nothing.

Admission assigns the smallest [weight class](weight-classes.md) that fits `S'`. It reports your
parameter count beside the class, and the count plays no part in assigning it. A season may set its
own cap on the count, which covers every value the document carries, wherever it carries it.

Hashes identify the files byte for byte, so a manifest edit that changes only formatting changes
your hash and your size.

## What is inspected

Admission re-hashes both files against what you declared and reads the graph from the protobuf
(parameters, nodes, operators, IR version, opset). It builds a plan, runs five inferences on
zero-filled inputs at your `probe_dims`, applies the platform's policy to what it measured, and
runs your manifest over the game's reference observations. It reports the input shapes it used,
what each adapter charged, and the measured inference time. **One time is a threshold: the probe's
median must fit the game's turn**, 1,000 ms for Ants, because a model slower than a turn at the
largest board cannot play one. No class caps your compute beyond that, and the turn deadline at play
is the bound that matters.

[Testing before you submit](testing.md) shows how to make the same measurements on your machine
with the same two libraries. A pass shows compatibility on the reference cases. It proves nothing
about playing strength, and it does not guarantee that every future observation fits your budget.
