# SMBJ deliberately excludes SPNEGO on Android (SmbConfig.ANDROID). RHFiles
# explicitly selects NTLM username/password; JGSS/Kerberos is not exposed.
-dontwarn org.ietf.jgss.**
# MBassador's optional expression-language filters are not used by SMBEventBus.
-dontwarn javax.el.**
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclassmembers class * {
    @net.engio.mbassy.listener.Handler <methods>;
}
# ZIP method 93 is explicitly rejected before opening its stream. We ship
# stored/deflate ZIP + gzip/xz/tar, not the optional zstd JNI codec.
-dontwarn com.github.luben.zstd.ZstdInputStream
