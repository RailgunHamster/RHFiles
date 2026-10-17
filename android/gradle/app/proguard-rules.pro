# SMBJ deliberately excludes SPNEGO on Android (SmbConfig.ANDROID). RHFiles
# explicitly selects NTLM username/password; JGSS/Kerberos is not exposed.
-dontwarn org.ietf.jgss.**
# MBassador's optional expression-language filters are not used by SMBEventBus.
-dontwarn javax.el.**
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclassmembers class * {
    @net.engio.mbassy.listener.Handler <methods>;
}
# MBassador constructs the invocation class selected by @Handler through
# getConstructor(SubscriptionContext.class), not a direct Java call. Keeping
# only annotated listener methods leaves this constructor stripped in R8.
-keep,includedescriptorclasses class * extends net.engio.mbassy.dispatch.HandlerInvocation {
    public <init>(net.engio.mbassy.subscription.SubscriptionContext);
}
# ZIP method 93 is explicitly rejected before opening its stream. We ship
# stored/deflate ZIP + gzip/xz/tar, not the optional zstd JNI codec.
-dontwarn com.github.luben.zstd.ZstdInputStream
# JNI lifetime stop is callable even while both browsing panes are hidden.
-keep class com.railgunhamster.rhfiles.NearbyService { *; }
# NDR structures and union arms are instantiated reflectively by the RPC codec.
-keep class com.rapid7.client.dcerpc.** { *; }
