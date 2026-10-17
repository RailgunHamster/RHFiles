package com.railgunhamster.rhfiles

import java.io.IOException

/** Portable codec errors; descriptors match the two RMI exception constructors. */
class RpcMarshalException @JvmOverloads constructor(message:String?,cause:Exception?=null):IOException(message,cause)
class RpcUnmarshalException @JvmOverloads constructor(message:String?,cause:Exception?=null):IOException(message,cause)
